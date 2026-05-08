import { create } from 'zustand';
import { useStudioSessionStore } from './studioSessionStore';
import {
  getDocumentRepository,
  type PdfDocument,
} from '@/lib/persistence/pdfDocumentRepository';

// Bridge studioStore -> studioSessionStore (one-way, dopóki istnieją oba w Fazie 0).
// Zapewnia per-tab viewState (currentPage, zoom) PRZEZ sessionStore — komponenty
// jak PdfViewer/PagesPanel/ViewerToolbar czytają z sessionStore, nie z legacy currentPage.
const sessionStore = () => useStudioSessionStore.getState();

/**
 * Faza 2: persist document do IndexedDB (fire-and-forget, nie blokuje UI).
 * Wywoływany z setFileData/replaceFileData. Pierwsza zapisuje,
 * kolejne aktualizują currentData/version/lastEditedAt.
 */
interface PersistArgs {
  id: string;
  name: string;
  data: Uint8Array;
  pageCount: number;
  version: number;
}

async function persistDocument(args: PersistArgs): Promise<void> {
  try {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return;
    const repo = getDocumentRepository();
    const existing = await repo.load(args.id);
    const doc: PdfDocument = existing
      ? {
          ...existing,
          name: args.name,
          currentData: args.data,
          pageCount: args.pageCount,
          version: args.version,
          lastEditedAt: Date.now(),
        }
      : {
          id: args.id,
          name: args.name,
          originalData: args.data,
          currentData: args.data,
          pageCount: args.pageCount,
          version: args.version,
          createdAt: Date.now(),
          lastEditedAt: args.version > 0 ? Date.now() : null,
          undoStack: [],
          redoStack: [],
        };
    await repo.save(doc);
  } catch (err) {
    console.warn('[studioStore] persistDocument error', err);
  }
}

async function deleteDocument(fileId: string): Promise<void> {
  try {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return;
    await getDocumentRepository().delete(fileId);
  } catch (err) {
    console.warn('[studioStore] deleteDocument error', err);
  }
}

export type StudioToolId =
  | 'split'
  | 'merge'
  | 'compress'
  | 'watermark'
  | 'encrypt'
  | 'rotate'
  | 'page-numbers'
  | 'ocr'
  | 'pdf-to-docx'
  | 'pdf-to-excel'
  | 'pdf-to-pptx'
  | 'word-to-pdf'
  | 'excel-to-pdf'
  | 'image-to-pdf'
  | 'edit-metadata'
  | 'extract-images'
  | 'sign'
  // Wave-2: PDF→PDF page operations
  | 'delete'
  | 'organize'
  | 'extract'
  | 'crop'
  | 'add-blank-page'
  | 'n-up'
  | 'flatten'
  | 'header-footer'
  | 'remove-annotations'
  | 'remove-blank-pages'
  // Wave-3 Group A: PDF→PDF / page operations / utilities (29 tools)
  // — std refactor with onComplete (16):
  | 'background-color'
  | 'bookmark'
  | 'combine-single-page'
  | 'decrypt'
  | 'divide'
  | 'fix-page-size'
  | 'invert-colors'
  | 'page-dimensions'
  | 'posterize'
  | 'remove-metadata'
  | 'remove-restrictions'
  | 'reverse'
  | 'rotate-custom'
  | 'sanitize'
  | 'table-of-contents'
  | 'text-color'
  // — special refactor with onComplete (3):
  | 'find-and-redact'
  | 'pdf-to-greyscale'
  | 'pdf-booklet'
  // — special refactor without onComplete (2, ZIP/ambig output):
  | 'rasterize'
  | 'ocg-manager'
  // — self-uploader, no ToolComponent refactor (8):
  | 'alternate-merge'
  | 'grid-combine'
  | 'linearize'
  | 'repair'
  | 'edit-pdf'
  | 'stamps'
  | 'deskew'
  | 'font-to-outline'
  | null;

export interface StudioFile {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount: number | null;
  data: Uint8Array | null;
  version: number;
}

interface StudioState {
  files: StudioFile[];
  currentFileId: string | null;
  currentTool: StudioToolId;
  currentPage: number;
  zoomLevel: number;
  isProcessing: boolean;
  showLeftSidebar: boolean;
  showRightPanel: boolean;

  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  selectFile: (id: string) => void;
  setPageCount: (id: string, pageCount: number) => void;
  setFileData: (id: string, data: Uint8Array, opts?: { initialLoad?: boolean }) => void;
  selectTool: (tool: StudioToolId) => void;
  setCurrentPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  setProcessing: (processing: boolean) => void;
  toggleLeftSidebar: () => void;
  toggleRightPanel: () => void;
  reset: () => void;

  removePage: (fileId: string, pageIndex: number) => Promise<void>;
  reorderPages: (fileId: string, fromIndex: number, toIndex: number) => Promise<void>;
  getCurrentBuffer: (id: string) => Promise<Uint8Array>;
  replaceFileData: (fileId: string, blob: Blob, newName?: string) => Promise<void>;
  restoreFromPersisted: (docs: PdfDocument[]) => void;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const useStudioStore = create<StudioState>((set, get) => ({
  files: [],
  currentFileId: null,
  currentTool: null,
  currentPage: 1,
  zoomLevel: 1.0,
  isProcessing: false,
  showLeftSidebar: true,
  showRightPanel: true,

  addFiles: (newFiles) => {
    const studioFiles: StudioFile[] = newFiles.map((file) => ({
      id: generateId(),
      file,
      name: file.name,
      size: file.size,
      pageCount: null,
      data: null,
      version: 0,
    }));
    set((state) => ({
      files: [...state.files, ...studioFiles],
      currentFileId: state.currentFileId ?? studioFiles[0]?.id ?? null,
    }));
    // Bridge → sessionStore: open tab per plik (1:1 mapping ID)
    for (const sf of studioFiles) {
      sessionStore().openTab(sf.id, sf.name, sf.pageCount);
    }
    // Eager load + persist KAŻDEGO pliku (nie tylko aktywnego). PdfViewer renderuje
    // tylko aktywny tab — bez tego eager loada drugi tab nigdy nie trafiłby do IDB.
    for (const sf of studioFiles) {
      void (async () => {
        try {
          const buffer = await sf.file.arrayBuffer();
          const data = new Uint8Array(buffer);
          get().setFileData(sf.id, data, { initialLoad: true });
          const { loadPdfLib } = await import('@/lib/pdf/loader');
          const pdfLib = await loadPdfLib();
          const doc = await pdfLib.PDFDocument.load(data.slice());
          get().setPageCount(sf.id, doc.getPageCount());
        } catch (err) {
          console.warn('[studioStore] addFiles eager load error', err);
        }
      })();
    }
  },

  removeFile: (id) => {
    set((state) => {
      const updatedFiles = state.files.filter((f) => f.id !== id);
      const newCurrentId =
        state.currentFileId === id ? (updatedFiles[0]?.id ?? null) : state.currentFileId;
      return {
        files: updatedFiles,
        currentFileId: newCurrentId,
        currentPage: state.currentFileId === id ? 1 : state.currentPage,
      };
    });
    sessionStore().closeTab(id);
    void deleteDocument(id);
  },

  selectFile: (id) => {
    set({ currentFileId: id });
    sessionStore().selectTab(id);
  },

  setPageCount: (id, pageCount) => {
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, pageCount } : f)),
    }));
    sessionStore().updateTabMeta(id, { pageCount });
    const file = get().files.find((f) => f.id === id);
    if (file && file.data) {
      void persistDocument({
        id: file.id,
        name: file.name,
        data: file.data,
        pageCount,
        version: file.version,
      });
    }
  },

  setFileData: (id, data, opts) => {
    const isInitial = opts?.initialLoad === true;
    set((state) => ({
      files: state.files.map((f) =>
        f.id === id
          ? {
              ...f,
              data,
              version: isInitial ? f.version : f.version + 1,
              size: data.byteLength,
            }
          : f,
      ),
    }));
    const file = get().files.find((f) => f.id === id);
    if (file) {
      sessionStore().updateTabMeta(id, {
        version: file.version,
        isDirty: !isInitial,
        lastEditedAt: isInitial ? null : Date.now(),
      });
      // Faza 2: auto-save do IndexedDB (fire-and-forget)
      void persistDocument({
        id: file.id,
        name: file.name,
        data,
        pageCount: file.pageCount ?? 0,
        version: file.version,
      });
    }
  },

  selectTool: (tool) => {
    set({ currentTool: tool });
    sessionStore().selectTool(tool);
  },

  setCurrentPage: (page) => {
    set({ currentPage: Math.max(1, page) });
    sessionStore().setCurrentPage(page);
  },

  setZoom: (zoom) => {
    const clamped = Math.max(0.25, Math.min(4.0, zoom));
    set({ zoomLevel: clamped });
    sessionStore().setZoom(clamped);
  },

  setProcessing: (processing) => set({ isProcessing: processing }),

  toggleLeftSidebar: () => set((state) => ({ showLeftSidebar: !state.showLeftSidebar })),

  toggleRightPanel: () => set((state) => ({ showRightPanel: !state.showRightPanel })),

  reset: () => {
    set({
      files: [],
      currentFileId: null,
      currentTool: null,
      currentPage: 1,
      zoomLevel: 1.0,
      isProcessing: false,
    });
    sessionStore().reset();
    // Faza 2: clear IndexedDB
    void getDocumentRepository().clear();
  },

  restoreFromPersisted: (docs) => {
    // Restore z IDB: użyj istniejących ID + data + pageCount.
    // NIE używamy addFiles (które generuje nowe ID → orphan docs w IDB).
    // NIE wywołujemy persistDocument (są już w IDB).
    const studioFiles: StudioFile[] = docs.map((doc) => {
      const blob = new Blob([doc.currentData.slice() as BlobPart], {
        type: 'application/pdf',
      });
      const file = new File([blob], doc.name, { type: 'application/pdf' });
      return {
        id: doc.id,
        file,
        name: doc.name,
        size: doc.currentData.byteLength,
        pageCount: doc.pageCount,
        data: doc.currentData,
        version: doc.version,
      };
    });
    set((state) => ({
      files: [...state.files, ...studioFiles],
      currentFileId: state.currentFileId ?? studioFiles[0]?.id ?? null,
    }));
    for (const sf of studioFiles) {
      sessionStore().openTab(sf.id, sf.name, sf.pageCount);
    }
  },

  getCurrentBuffer: async (id) => {
    const file = get().files.find((f) => f.id === id);
    if (!file) throw new Error('File not found');
    if (file.data) return file.data;
    const buffer = await file.file.arrayBuffer();
    const data = new Uint8Array(buffer);
    get().setFileData(id, data, { initialLoad: true });
    return data;
  },

  removePage: async (fileId, pageIndex) => {
    const { loadPdfLib } = await import('@/lib/pdf/loader');
    const buffer = await get().getCurrentBuffer(fileId);
    const pdfLib = await loadPdfLib();
    const doc = await pdfLib.PDFDocument.load(buffer.slice());
    if (doc.getPageCount() <= 1) return;
    doc.removePage(pageIndex);
    const newData = await doc.save();
    get().setFileData(fileId, newData);
    set((state) => ({
      files: state.files.map((f) =>
        f.id === fileId ? { ...f, pageCount: doc.getPageCount() } : f,
      ),
      currentPage: Math.min(state.currentPage, doc.getPageCount()),
    }));
    // Faza 1.5: push op do undoStack w repo (po persistDocument z setFileData)
    try {
      const repo = getDocumentRepository();
      const persisted = await repo.load(fileId);
      if (persisted) {
        await repo.save({
          ...persisted,
          undoStack: [
            ...persisted.undoStack,
            { type: 'remove-page', pageIndex } as const,
          ].slice(-20),
          redoStack: [],
        });
      }
    } catch (err) {
      console.warn('[studioStore] removePage push undo op error', err);
    }
  },

  replaceFileData: async (fileId, blob, newName) => {
    const buffer = await blob.arrayBuffer();
    const data = new Uint8Array(buffer);
    set((state) => ({
      files: state.files.map((f) => {
        if (f.id !== fileId) return f;
        const finalName = newName ?? f.name;
        return {
          ...f,
          file: new File([blob], finalName, { type: 'application/pdf' }),
          name: finalName,
          data,
          version: f.version + 1,
          size: blob.size,
          pageCount: null,
        };
      }),
    }));
  },

  reorderPages: async (fileId, fromIndex, toIndex) => {
    const { loadPdfLib } = await import('@/lib/pdf/loader');
    const buffer = await get().getCurrentBuffer(fileId);
    const pdfLib = await loadPdfLib();
    const sourceDoc = await pdfLib.PDFDocument.load(buffer.slice());
    const totalPages = sourceDoc.getPageCount();
    if (fromIndex < 0 || fromIndex >= totalPages || toIndex < 0 || toIndex >= totalPages) return;

    const previousOrder = Array.from({ length: totalPages }, (_, i) => i);
    const newOrder = [...previousOrder];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);

    const newDoc = await pdfLib.PDFDocument.create();
    const copiedPages = await newDoc.copyPages(sourceDoc, newOrder);
    copiedPages.forEach((page) => newDoc.addPage(page));
    const newData = await newDoc.save();
    get().setFileData(fileId, newData);
    // Faza 1.5: push reorder op z newOrder dla replay forward
    try {
      const repo = getDocumentRepository();
      const persisted = await repo.load(fileId);
      if (persisted) {
        await repo.save({
          ...persisted,
          undoStack: [
            ...persisted.undoStack,
            { type: 'reorder-pages', previousOrder, newOrder } as const,
          ].slice(-20),
          redoStack: [],
        });
      }
    } catch (err) {
      console.warn('[studioStore] reorderPages push undo op error', err);
    }
  },
}));

export const selectCurrentFile = (state: StudioState): StudioFile | null =>
  state.files.find((f) => f.id === state.currentFileId) ?? null;
