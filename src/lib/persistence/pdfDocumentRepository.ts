/**
 * PdfDocumentRepository — warstwa persystencji dokumentów PDF.
 *
 * Faza 0: in-memory Map (na razie). Faza 2 doda IndexedDB przez idb-keyval +
 * structuredClone serialization (NIE JSON middleware — anti-pattern dla Uint8Array).
 *
 * Kontrakt API jest zaprojektowany pod async (IDB), nawet gdy in-memory,
 * żeby Faza 2 nie wymagała zmian w call sites.
 */

export type PageOperation =
  | { type: 'remove-page'; pageIndex: number }
  | { type: 'reorder-pages'; previousOrder: number[] }
  | { type: 'replace-blob'; previousBlobId: string };

export interface PdfDocument {
  id: string;
  name: string;
  originalData: Uint8Array;
  currentData: Uint8Array;
  pageCount: number;
  version: number;
  createdAt: number;
  lastEditedAt: number | null;
  undoStack: PageOperation[];
  redoStack: PageOperation[];
}

export interface QuotaStatus {
  used: number;
  available: number;
  persistent: boolean;
}

export interface PdfDocumentRepositoryAPI {
  save(doc: PdfDocument): Promise<void>;
  load(id: string): Promise<PdfDocument | null>;
  delete(id: string): Promise<void>;
  listIds(): Promise<string[]>;
  listAll(): Promise<PdfDocument[]>;
  getQuotaStatus(): Promise<QuotaStatus>;
  requestPersistent(): Promise<boolean>;
  evictLRU(targetFreeMB: number): Promise<string[]>;
}

class InMemoryRepository implements PdfDocumentRepositoryAPI {
  private store = new Map<string, PdfDocument>();

  async save(doc: PdfDocument): Promise<void> {
    this.store.set(doc.id, doc);
  }

  async load(id: string): Promise<PdfDocument | null> {
    return this.store.get(id) ?? null;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async listIds(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  async listAll(): Promise<PdfDocument[]> {
    return Array.from(this.store.values());
  }

  async getQuotaStatus(): Promise<QuotaStatus> {
    let total = 0;
    for (const doc of this.store.values()) {
      total += doc.originalData.byteLength + doc.currentData.byteLength;
    }
    return { used: total, available: Number.MAX_SAFE_INTEGER, persistent: false };
  }

  async requestPersistent(): Promise<boolean> {
    return false;
  }

  async evictLRU(targetFreeMB: number): Promise<string[]> {
    const sortable = Array.from(this.store.values())
      .filter((d) => d.lastEditedAt !== null)
      .sort((a, b) => (a.lastEditedAt ?? 0) - (b.lastEditedAt ?? 0));
    const evicted: string[] = [];
    let freed = 0;
    const target = targetFreeMB * 1024 * 1024;
    for (const doc of sortable) {
      if (freed >= target) break;
      const size = doc.originalData.byteLength + doc.currentData.byteLength;
      this.store.delete(doc.id);
      evicted.push(doc.id);
      freed += size;
    }
    return evicted;
  }
}

let _instance: PdfDocumentRepositoryAPI | null = null;

export function getDocumentRepository(): PdfDocumentRepositoryAPI {
  if (!_instance) {
    _instance = new InMemoryRepository();
  }
  return _instance;
}

/**
 * Test/migration helper — pozwala podstawić własną implementację (np. IndexedDB w Fazie 2).
 */
export function setDocumentRepository(repo: PdfDocumentRepositoryAPI): void {
  _instance = repo;
}
