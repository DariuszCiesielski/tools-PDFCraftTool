/**
 * PdfDocumentRepository — warstwa persystencji dokumentów PDF.
 *
 * Faza 2: IndexedDB przez `idb-keyval` z natywną serializacją Uint8Array
 * przez structuredClone (NIE JSON middleware — anti-pattern wykryty przez
 * Qwen/Codex w cross-model review).
 *
 * Browser-only: na serwerze (SSR) używamy in-memory fallback.
 *
 * Quota strategy:
 * - navigator.storage.estimate() do monitorowania
 * - navigator.storage.persist() do request persistent storage
 * - LRU eviction przy QuotaExceededError (najstarszy lastEditedAt first)
 *
 * USP: pliki TYLKO local. Nie wysyłamy nic do Supabase storage.
 */

import {
  get as idbGet,
  set as idbSet,
  del as idbDel,
  keys as idbKeys,
  values as idbValues,
  createStore,
} from 'idb-keyval';

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
  clear(): Promise<void>;
}

const isBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof indexedDB !== 'undefined';

class IndexedDbRepository implements PdfDocumentRepositoryAPI {
  private store = createStore('pdfcraft-studio-docs', 'documents');

  async save(doc: PdfDocument): Promise<void> {
    try {
      await idbSet(doc.id, doc, this.store);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        // Fallback: spróbuj LRU eviction + retry
        const evicted = await this.evictLRU(50);
        if (evicted.length === 0) throw err;
        await idbSet(doc.id, doc, this.store);
      } else {
        throw err;
      }
    }
  }

  async load(id: string): Promise<PdfDocument | null> {
    const result = await idbGet<PdfDocument>(id, this.store);
    return result ?? null;
  }

  async delete(id: string): Promise<void> {
    await idbDel(id, this.store);
  }

  async listIds(): Promise<string[]> {
    const all = await idbKeys(this.store);
    return all.filter((k): k is string => typeof k === 'string');
  }

  async listAll(): Promise<PdfDocument[]> {
    const all = await idbValues<PdfDocument>(this.store);
    return all.filter(
      (d): d is PdfDocument =>
        !!d &&
        typeof d === 'object' &&
        'id' in d &&
        'currentData' in d &&
        'name' in d,
    );
  }

  async getQuotaStatus(): Promise<QuotaStatus> {
    if (!('storage' in navigator) || !('estimate' in navigator.storage)) {
      return { used: 0, available: 0, persistent: false };
    }
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    let persistent = false;
    try {
      persistent = (await navigator.storage.persisted?.()) ?? false;
    } catch {
      persistent = false;
    }
    return { used: usage, available: Math.max(0, quota - usage), persistent };
  }

  async requestPersistent(): Promise<boolean> {
    if (!('storage' in navigator) || !('persist' in navigator.storage)) {
      return false;
    }
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }

  async evictLRU(targetFreeMB: number): Promise<string[]> {
    const all = await this.listAll();
    const sortable = all
      .filter((d) => d.lastEditedAt !== null)
      .sort((a, b) => (a.lastEditedAt ?? 0) - (b.lastEditedAt ?? 0));
    const evicted: string[] = [];
    let freed = 0;
    const target = targetFreeMB * 1024 * 1024;
    for (const doc of sortable) {
      if (freed >= target) break;
      const size = doc.originalData.byteLength + doc.currentData.byteLength;
      try {
        await this.delete(doc.id);
        evicted.push(doc.id);
        freed += size;
      } catch {
        // continue
      }
    }
    return evicted;
  }

  async clear(): Promise<void> {
    const ids = await this.listIds();
    for (const id of ids) {
      await this.delete(id);
    }
  }
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

  async clear(): Promise<void> {
    this.store.clear();
  }
}

let _instance: PdfDocumentRepositoryAPI | null = null;

export function getDocumentRepository(): PdfDocumentRepositoryAPI {
  if (!_instance) {
    _instance = isBrowser() ? new IndexedDbRepository() : new InMemoryRepository();
  }
  return _instance;
}

/**
 * Test/migration helper — pozwala podstawić własną implementację (np. mock w testach).
 */
export function setDocumentRepository(repo: PdfDocumentRepositoryAPI): void {
  _instance = repo;
}
