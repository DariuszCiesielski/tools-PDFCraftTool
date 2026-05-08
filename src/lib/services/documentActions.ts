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
  type PageOperation,
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

/**
 * Reapply forward operation na buffer. Używane w replay-based undo.
 * Dla replace-blob NIE wykonuje nic — replay-based dla replace nie ma sensu
 * (current data po replace ≠ originalData + ops).
 */
async function applyOpForward(
  data: Uint8Array,
  op: PageOperation,
): Promise<{ data: Uint8Array; pageCount: number } | null> {
  const { loadPdfLib } = await import('@/lib/pdf/loader');
  const pdfLib = await loadPdfLib();

  if (op.type === 'remove-page') {
    const doc = await pdfLib.PDFDocument.load(data.slice());
    if (doc.getPageCount() <= 1) return null;
    doc.removePage(op.pageIndex);
    const newData = await doc.save();
    return { data: newData, pageCount: doc.getPageCount() };
  }

  if (op.type === 'reorder-pages') {
    if (!op.newOrder) return null;
    const sourceDoc = await pdfLib.PDFDocument.load(data.slice());
    const newDoc = await pdfLib.PDFDocument.create();
    const copied = await newDoc.copyPages(sourceDoc, op.newOrder);
    copied.forEach((p) => newDoc.addPage(p));
    const newData = await newDoc.save();
    return { data: newData, pageCount: newDoc.getPageCount() };
  }

  return null;
}

/**
 * Synchronizuje studioStore.files (data, pageCount) z repo po operacji.
 * Po documentActions.removePage/reorderPages/undo/redo konieczne żeby
 * PdfViewer zobaczył nowy buffer (rendering czyta z studioStore.files.data).
 */
async function syncStudioFromRepo(tabId: string): Promise<void> {
  const repo = getDocumentRepository();
  const session = useStudioSessionStore.getState();
  const tab = session.tabs.find((t) => t.id === tabId);
  if (!tab) return;
  const doc = await repo.load(tab.documentId);
  if (!doc) return;
  // initialLoad: false bo to LOAD po edycji, ale isDirty już ustawiony przez
  // documentActions na repo. Zostawiamy isDirty=true (operacja wykonana).
  useStudioStore.setState((state) => ({
    files: state.files.map((f) =>
      f.id === tabId
        ? {
            ...f,
            data: doc.currentData,
            pageCount: doc.pageCount,
            version: doc.version,
            size: doc.currentData.byteLength,
          }
        : f,
    ),
  }));
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
    const newOrder = [...previousOrder];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);

    const newDoc = await pdfLib.PDFDocument.create();
    const copiedPages = await newDoc.copyPages(sourceDoc, newOrder);
    copiedPages.forEach((page) => newDoc.addPage(page));
    const newData = await newDoc.save();

    const updated: PdfDocument = {
      ...doc,
      currentData: newData,
      version: doc.version + 1,
      lastEditedAt: Date.now(),
      undoStack: [
        ...doc.undoStack,
        { type: 'reorder-pages', previousOrder, newOrder } as const,
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
    // Faza 1.5: snapshot poprzedniego data jako blob (dla undo)
    const previousBlobId = generateId();
    await repo.saveBlob(previousBlobId, doc.currentData);

    const updated: PdfDocument = {
      ...doc,
      name: finalName,
      currentData: data,
      pageCount,
      version: doc.version + 1,
      lastEditedAt: Date.now(),
      undoStack: [
        ...doc.undoStack,
        { type: 'replace-blob', previousBlobId } as const,
      ].slice(-20),
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

  /**
   * Faza 1.5: undo ostatniej operacji.
   *
   * - remove-page, reorder-pages → replay-based: reset do originalData,
   *   reapply WSZYSTKIE forward ops PRZED ostatnią. Ostatnia op (popped)
   *   trafia na redoStack.
   * - replace-blob → backward: load previousBlobId, save current data jako
   *   nowy blob (dla redo), restore previous. Op popped, redo op stworzona
   *   z poprzednim previousBlobId zamienionym na "redoBlobId".
   *
   * Sync: studioStore.files.data, sessionStore.tabs.{pageCount,version,isDirty}.
   */
  async undo(tabId: string): Promise<boolean> {
    const repo = getDocumentRepository();
    const session = useStudioSessionStore.getState();
    const tab = session.tabs.find((t) => t.id === tabId);
    if (!tab) return false;
    const doc = await repo.load(tab.documentId);
    if (!doc || doc.undoStack.length === 0) return false;

    const lastOp = doc.undoStack[doc.undoStack.length - 1];
    const remainingOps = doc.undoStack.slice(0, -1);

    if (lastOp.type === 'replace-blob') {
      const previousData = await repo.loadBlob(lastOp.previousBlobId);
      if (!previousData) {
        console.warn('[documentActions] undo replace-blob: blob missing');
        return false;
      }
      // Snapshot CURRENT data jako redo blob
      const redoBlobId = generateId();
      await repo.saveBlob(redoBlobId, doc.currentData);
      // Stary previousBlobId teraz nieaktualny (po undo current to previousData)
      await repo.deleteBlob(lastOp.previousBlobId);

      let pageCount = doc.pageCount;
      try {
        pageCount = await detectPageCount(previousData);
      } catch (err) {
        console.warn('[documentActions] undo replace-blob detectPageCount', err);
      }

      const updated: PdfDocument = {
        ...doc,
        currentData: previousData,
        pageCount,
        version: doc.version + 1,
        lastEditedAt: Date.now(),
        undoStack: remainingOps,
        redoStack: [
          ...doc.redoStack,
          { type: 'replace-blob', previousBlobId: redoBlobId } as const,
        ].slice(-20),
      };
      await repo.save(updated);
      session.updateTabMeta(tabId, {
        pageCount,
        version: updated.version,
        isDirty: true,
        lastEditedAt: updated.lastEditedAt,
      });
      await syncStudioFromRepo(tabId);
      return true;
    }

    // remove-page / reorder-pages → replay-based
    let currentData = doc.originalData;
    let pageCount: number;
    try {
      pageCount = await detectPageCount(currentData);
    } catch {
      pageCount = doc.pageCount;
    }
    for (const replayOp of remainingOps) {
      const result = await applyOpForward(currentData, replayOp);
      if (!result) {
        console.warn('[documentActions] undo replay: op skipped', replayOp.type);
        continue;
      }
      currentData = result.data;
      pageCount = result.pageCount;
    }

    const updated: PdfDocument = {
      ...doc,
      currentData,
      pageCount,
      version: doc.version + 1,
      lastEditedAt: Date.now(),
      undoStack: remainingOps,
      redoStack: [...doc.redoStack, lastOp].slice(-20),
    };
    await repo.save(updated);
    session.updateTabMeta(tabId, {
      pageCount,
      version: updated.version,
      isDirty: true,
      lastEditedAt: updated.lastEditedAt,
    });
    await syncStudioFromRepo(tabId);
    return true;
  },

  /**
   * Faza 1.5: redo ostatnio cofniętej operacji.
   *
   * Pop z redoStack, apply forward (lub dla replace-blob: restore z redo blob).
   */
  async redo(tabId: string): Promise<boolean> {
    const repo = getDocumentRepository();
    const session = useStudioSessionStore.getState();
    const tab = session.tabs.find((t) => t.id === tabId);
    if (!tab) return false;
    const doc = await repo.load(tab.documentId);
    if (!doc || doc.redoStack.length === 0) return false;

    const lastRedo = doc.redoStack[doc.redoStack.length - 1];
    const remainingRedo = doc.redoStack.slice(0, -1);

    if (lastRedo.type === 'replace-blob') {
      const redoData = await repo.loadBlob(lastRedo.previousBlobId);
      if (!redoData) {
        console.warn('[documentActions] redo replace-blob: blob missing');
        return false;
      }
      // Snapshot CURRENT jako new previousBlob (dla potem undo)
      const newPreviousBlobId = generateId();
      await repo.saveBlob(newPreviousBlobId, doc.currentData);
      await repo.deleteBlob(lastRedo.previousBlobId);

      let pageCount = doc.pageCount;
      try {
        pageCount = await detectPageCount(redoData);
      } catch (err) {
        console.warn('[documentActions] redo replace-blob detectPageCount', err);
      }

      const updated: PdfDocument = {
        ...doc,
        currentData: redoData,
        pageCount,
        version: doc.version + 1,
        lastEditedAt: Date.now(),
        undoStack: [
          ...doc.undoStack,
          { type: 'replace-blob', previousBlobId: newPreviousBlobId } as const,
        ].slice(-20),
        redoStack: remainingRedo,
      };
      await repo.save(updated);
      session.updateTabMeta(tabId, {
        pageCount,
        version: updated.version,
        isDirty: true,
        lastEditedAt: updated.lastEditedAt,
      });
      await syncStudioFromRepo(tabId);
      return true;
    }

    // remove-page / reorder-pages → apply forward
    const result = await applyOpForward(doc.currentData, lastRedo);
    if (!result) {
      console.warn('[documentActions] redo: op cannot replay forward', lastRedo.type);
      return false;
    }

    const updated: PdfDocument = {
      ...doc,
      currentData: result.data,
      pageCount: result.pageCount,
      version: doc.version + 1,
      lastEditedAt: Date.now(),
      undoStack: [...doc.undoStack, lastRedo].slice(-20),
      redoStack: remainingRedo,
    };
    await repo.save(updated);
    session.updateTabMeta(tabId, {
      pageCount: result.pageCount,
      version: updated.version,
      isDirty: true,
      lastEditedAt: updated.lastEditedAt,
    });
    await syncStudioFromRepo(tabId);
    return true;
  },

  /**
   * Stan undo/redo dla aktywnego taba — używane przez UI (disable buttons).
   */
  async getUndoRedoState(
    tabId: string,
  ): Promise<{ canUndo: boolean; canRedo: boolean }> {
    const repo = getDocumentRepository();
    const session = useStudioSessionStore.getState();
    const tab = session.tabs.find((t) => t.id === tabId);
    if (!tab) return { canUndo: false, canRedo: false };
    const doc = await repo.load(tab.documentId);
    if (!doc) return { canUndo: false, canRedo: false };
    return {
      canUndo: doc.undoStack.length > 0,
      canRedo: doc.redoStack.length > 0,
    };
  },
};

export type DocumentActions = typeof documentActions;
