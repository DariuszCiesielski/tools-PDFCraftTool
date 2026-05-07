import { create } from 'zustand';

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
  setFileData: (id: string, data: Uint8Array) => void;
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

  addFiles: (newFiles) =>
    set((state) => {
      const studioFiles: StudioFile[] = newFiles.map((file) => ({
        id: generateId(),
        file,
        name: file.name,
        size: file.size,
        pageCount: null,
        data: null,
        version: 0,
      }));
      const updatedFiles = [...state.files, ...studioFiles];
      return {
        files: updatedFiles,
        currentFileId: state.currentFileId ?? studioFiles[0]?.id ?? null,
      };
    }),

  removeFile: (id) =>
    set((state) => {
      const updatedFiles = state.files.filter((f) => f.id !== id);
      const newCurrentId =
        state.currentFileId === id ? (updatedFiles[0]?.id ?? null) : state.currentFileId;
      return {
        files: updatedFiles,
        currentFileId: newCurrentId,
        currentPage: state.currentFileId === id ? 1 : state.currentPage,
      };
    }),

  selectFile: (id) => set({ currentFileId: id, currentPage: 1 }),

  setPageCount: (id, pageCount) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, pageCount } : f)),
    })),

  setFileData: (id, data) =>
    set((state) => ({
      files: state.files.map((f) =>
        f.id === id
          ? {
              ...f,
              data,
              version: f.version + 1,
              size: data.byteLength,
            }
          : f,
      ),
    })),

  selectTool: (tool) => set({ currentTool: tool }),

  setCurrentPage: (page) => set({ currentPage: Math.max(1, page) }),

  setZoom: (zoom) => set({ zoomLevel: Math.max(0.25, Math.min(4.0, zoom)) }),

  setProcessing: (processing) => set({ isProcessing: processing }),

  toggleLeftSidebar: () => set((state) => ({ showLeftSidebar: !state.showLeftSidebar })),

  toggleRightPanel: () => set((state) => ({ showRightPanel: !state.showRightPanel })),

  reset: () =>
    set({
      files: [],
      currentFileId: null,
      currentTool: null,
      currentPage: 1,
      zoomLevel: 1.0,
      isProcessing: false,
    }),

  getCurrentBuffer: async (id) => {
    const file = get().files.find((f) => f.id === id);
    if (!file) throw new Error('File not found');
    if (file.data) return file.data;
    const buffer = await file.file.arrayBuffer();
    const data = new Uint8Array(buffer);
    get().setFileData(id, data);
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

    const order = Array.from({ length: totalPages }, (_, i) => i);
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);

    const newDoc = await pdfLib.PDFDocument.create();
    const copiedPages = await newDoc.copyPages(sourceDoc, order);
    copiedPages.forEach((page) => newDoc.addPage(page));
    const newData = await newDoc.save();
    get().setFileData(fileId, newData);
  },
}));

export const selectCurrentFile = (state: StudioState): StudioFile | null =>
  state.files.find((f) => f.id === state.currentFileId) ?? null;
