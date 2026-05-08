/**
 * DocumentActions — facade łączący StudioSessionStore + PdfDocumentRepository.
 *
 * Wszystkie mutacje co dotykają obu stores przechodzą tutaj.
 * Eliminuje cross-store inconsistency (np. close tab bez delete dokumentu).
 *
 * Faza 0: minimum dla obecnych operacji (importFiles, removePage, reorderPages,
 * replaceWithBlob, closeTab). Faza 1 doda combineDocuments. Faza 1.5 doda undo/redo.
 */

import {
  getDocumentRepository,
  type PdfDocument,
} from '@/lib/persistence/pdfDocumentRepository';
import { useStudioSessionStore } from '@/lib/stores/studioSessionStore';
import { useStudioStore } from '@/lib/stores/studioStore';

const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

async function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

async function detectPageCount(data: Uint8Array): Promise<number> {
  const { loadPdfLib } = await import('@/lib/pdf/loader');
  const pdfLib = await loadPdfLib();
  const doc = await pdfLib.PDFDocument.load(data.slice(), {
    ignoreEncryption: true,
  });
  return doc.getPageCount();
}

export interface ImportedFile {
  tabId: string;
  documentId: string;
  name: string;
}

export const documentActions = {
  async importFiles(files: File[]): Promise<ImportedFile[]> {
    const repo = getDocumentRepository();
    const session = useStudioSessionStore.getState();
    const results: ImportedFile[] = [];

    for (const file of files) {
      const data = await readFileAsUint8Array(file);
      let pageCount = 0;
      try {
        pageCount = await detectPageCount(data);
      } catch (err) {
        console.warn('[documentActions] page count detect failed', err);
      }

      const id = generateId();
      const doc: PdfDocument = {
        id,
        name: file.name,
        originalData: data,
        currentData: data,
        pageCount,
        version: 0,
        createdAt: Date.now(),
        lastEditedAt: null,
        undoStack: [],
        redoStack: [],
      };
      await repo.save(doc);
      const tabId = session.openTab(id, file.name, pageCount);
      results.push({ tabId, documentId: id, name: file.name });
    }

    return results;
  },

  async closeTab(tabId: string, options: { confirmDirty?: boolean } = {}): Promise<boolean> {
    const session = useStudioSessionStore.getState();
    const tab = session.tabs.find((t) => t.id === tabId);
    if (!tab) return false;

    if (tab.isDirty && options.confirmDirty !== false) {
      // Faza 0: prosty confirm. Faza 2 zastąpi to custom modalem.
      const ok =
        typeof window !== 'undefined'
          ? window.confirm(
              `Plik "${tab.name}" ma niezapisane zmiany. Zamknąć zakładkę?`,
            )
          : true;
      if (!ok) return false;
    }

    const repo = getDocumentRepository();
    await repo.delete(tab.documentId);
    session.closeTab(tabId);
    return true;
  },

  async getDocument(tabId: string): Promise<PdfDocument | null> {
    const session = useStudioSessionStore.getState();
    const tab = session.tabs.find((t) => t.id === tabId);
    if (!tab) return null;
    const repo = getDocumentRepository();
    return repo.load(tab.documentId);
  },

  async getCurrentBuffer(tabId: string): Promise<Uint8Array> {
    const doc = await this.getDocument(tabId);
    if (!doc) throw new Error(`Document not found for tab ${tabId}`);
    return doc.currentData;
  },

  async removePage(tabId: string, pageIndex: number): Promise<void> {
    const repo = getDocumentRepository();
    const session = useStudioSessionStore.getState();
    const tab = session.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const doc = await repo.load(tab.documentId);
    if (!doc) return;

    const { loadPdfLib } = await import('@/lib/pdf/loader');
    const pdfLib = await loadPdfLib();
    const pdfDoc = await pdfLib.PDFDocument.load(doc.currentData.slice());
    if (pdfDoc.getPageCount() <= 1) return;
    pdfDoc.removePage(pageIndex);
    const newData = await pdfDoc.save();

    const updated: PdfDocument = {
      ...doc,
      currentData: newData,
      pageCount: pdfDoc.getPageCount(),
      version: doc.version + 1,
      lastEditedAt: Date.now(),
      undoStack: [
        ...doc.undoStack,
        { type: 'remove-page', pageIndex } as const,
      ].slice(-20),
      redoStack: [],
    };
    await repo.save(updated);
    session.updateTabMeta(tabId, {
      pageCount: pdfDoc.getPageCount(),
      version: updated.version,
      isDirty: true,
      lastEditedAt: updated.lastEditedAt,
    });
  },

  async reorderPages(
    tabId: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> {
    const repo = getDocumentRepository();
    const session = useStudioSessionStore.getState();
    const tab = session.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const doc = await repo.load(tab.documentId);
    if (!doc) return;

    const { loadPdfLib } = await import('@/lib/pdf/loader');
    const pdfLib = await loadPdfLib();
    const sourceDoc = await pdfLib.PDFDocument.load(doc.currentData.slice());
    const totalPages = sourceDoc.getPageCount();
    if (
      fromIndex < 0 ||
      fromIndex >= totalPages ||
      toIndex < 0 ||
      toIndex >= totalPages
    )
      return;

    const previousOrder = Array.from({ length: totalPages }, (_, i) => i);
    const order = [...previousOrder];
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);

    const newDoc = await pdfLib.PDFDocument.create();
    const copiedPages = await newDoc.copyPages(sourceDoc, order);
    copiedPages.forEach((page) => newDoc.addPage(page));
    const newData = await newDoc.save();

    const updated: PdfDocument = {
      ...doc,
      currentData: newData,
      version: doc.version + 1,
      lastEditedAt: Date.now(),
      undoStack: [
        ...doc.undoStack,
        { type: 'reorder-pages', previousOrder } as const,
      ].slice(-20),
      redoStack: [],
    };
    await repo.save(updated);
    session.updateTabMeta(tabId, {
      version: updated.version,
      isDirty: true,
      lastEditedAt: updated.lastEditedAt,
    });
  },

  async replaceWithBlob(
    tabId: string,
    blob: Blob,
    newName?: string,
  ): Promise<void> {
    const repo = getDocumentRepository();
    const session = useStudioSessionStore.getState();
    const tab = session.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const doc = await repo.load(tab.documentId);
    if (!doc) return;

    const buffer = await blob.arrayBuffer();
    const data = new Uint8Array(buffer);
    let pageCount = doc.pageCount;
    try {
      pageCount = await detectPageCount(data);
    } catch (err) {
      console.warn('[documentActions] replaceWithBlob page count failed', err);
    }

    const finalName = newName ?? doc.name;
    const updated: PdfDocument = {
      ...doc,
      name: finalName,
      currentData: data,
      pageCount,
      version: doc.version + 1,
      lastEditedAt: Date.now(),
      // 'replace-blob' op log dodamy w Fazie 1.5 (potrzebuje previousBlobId infra)
      undoStack: doc.undoStack,
      redoStack: [],
    };
    await repo.save(updated);
    session.updateTabMeta(tabId, {
      name: finalName,
      pageCount,
      version: updated.version,
      isDirty: true,
      lastEditedAt: updated.lastEditedAt,
    });
  },

  /**
   * Combine wielu otwartych zakładek w nowy dokument C.
   *
   * Acrobat-style: A i B zostają otwarte, C powstaje jako nowa zakładka,
   * auto-switch na C.
   *
   * @param tabIds — kolejność ma znaczenie (zachowana w merged output)
   * @param outputName — nazwa pliku C, np. "Połączony 1.pdf"
   * @returns ImportedFile — tabId/documentId/name nowej zakładki
   */
  async combineDocuments(
    tabIds: string[],
    outputName: string,
  ): Promise<ImportedFile> {
    if (tabIds.length < 2) {
      throw new Error('combineDocuments wymaga co najmniej 2 dokumentów');
    }
    const repo = getDocumentRepository();
    const docs: PdfDocument[] = [];
    for (const tabId of tabIds) {
      const session = useStudioSessionStore.getState();
      const tab = session.tabs.find((t) => t.id === tabId);
      if (!tab) throw new Error(`Tab not found: ${tabId}`);
      let doc = await repo.load(tab.documentId);
      if (!doc) {
        // Faza 0/1 fallback: zwykły upload przez studioStore.addFiles tworzy tab,
        // ale NIE tworzy dokumentu w repo. Wzbogacamy z bufferów studioStore.
        // Faza 2 (IndexedDB) zmieni to gdy wszystkie uploady pójdą przez documentActions.importFiles.
        const studio = useStudioStore.getState();
        const studioFile = studio.files.find((f) => f.id === tab.id);
        if (!studioFile) {
          throw new Error(`No file in studio for tab ${tabId}`);
        }
        const data = await studio.getCurrentBuffer(studioFile.id);
        doc = {
          id: tab.id,
          name: studioFile.name,
          originalData: data,
          currentData: data,
          pageCount: studioFile.pageCount ?? 0,
          version: studioFile.version,
          createdAt: Date.now(),
          lastEditedAt: null,
          undoStack: [],
          redoStack: [],
        };
        await repo.save(doc);
      }
      docs.push(doc);
    }

    const { loadPdfLib } = await import('@/lib/pdf/loader');
    const pdfLib = await loadPdfLib();
    const merged = await pdfLib.PDFDocument.create();
    for (const doc of docs) {
      const source = await pdfLib.PDFDocument.load(doc.currentData.slice(), {
        ignoreEncryption: true,
      });
      const indices = source.getPageIndices();
      const pages = await merged.copyPages(source, indices);
      pages.forEach((p) => merged.addPage(p));
    }
    const mergedBytes = await merged.save();
    const blob = new Blob([mergedBytes as BlobPart], {
      type: 'application/pdf',
    });
    return this.createDocumentFromBlob(blob, outputName);
  },

  /**
   * Tworzy nowy dokument z Blob + dodaje go jako nową zakładkę.
   *
   * Idzie przez studioStore.addFiles() (bridge propaguje do sessionStore),
   * potem setFileData wgrywa data od razu (zamiast lazy). Plus zapisuje
   * snapshot do PdfDocumentRepository pod TYM SAMYM ID (synchronizacja).
   */
  async createDocumentFromBlob(
    blob: Blob,
    name: string,
  ): Promise<ImportedFile> {
    const buffer = await blob.arrayBuffer();
    const data = new Uint8Array(buffer);
    let pageCount = 0;
    try {
      pageCount = await detectPageCount(data);
    } catch (err) {
      console.warn(
        '[documentActions] createDocumentFromBlob page count failed',
        err,
      );
    }

    const file = new File([blob], name, { type: 'application/pdf' });
    const studio = useStudioStore.getState();
    const beforeIds = new Set(studio.files.map((f) => f.id));
    studio.addFiles([file]);
    // Bridge dodaje do sessionStore. Znajdź nowo dodany plik:
    const afterFiles = useStudioStore.getState().files;
    const newFile = afterFiles.find((f) => !beforeIds.has(f.id));
    if (!newFile) {
      throw new Error('Failed to add file to studio store');
    }
    // Świeżo utworzony przez combine — nie jest "modified" w mental model usera.
    // initialLoad: true neutralizuje race z eager loadem z addFiles (oba używają tego samego flagu).
    useStudioStore.getState().setFileData(newFile.id, data, { initialLoad: true });
    useStudioStore.getState().setPageCount(newFile.id, pageCount);
    // Auto-switch
    useStudioStore.getState().selectFile(newFile.id);

    // Snapshot do PdfDocumentRepository (Faza 2 IDB)
    const repo = getDocumentRepository();
    const doc: PdfDocument = {
      id: newFile.id,
      name,
      originalData: data,
      currentData: data,
      pageCount,
      version: 0,
      createdAt: Date.now(),
      lastEditedAt: null,
      undoStack: [],
      redoStack: [],
    };
    await repo.save(doc);

    return { tabId: newFile.id, documentId: newFile.id, name };
  },
};

export type DocumentActions = typeof documentActions;
