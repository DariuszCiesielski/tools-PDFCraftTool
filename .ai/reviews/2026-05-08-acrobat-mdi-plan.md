# Plan v3 — refactor PDFCraft Studio do Acrobat-style MDI

**Data:** 2026-05-08
**Wersja:** v3 (po cross-model review Codex + Qwen — oba GO_WITH_CHANGES, plan v2 wymagał REWRITE)
**Stack:** Next.js 14+ App Router, TypeScript strict, Zustand, @dnd-kit, pdf-lib, Supabase, idb-keyval, Vercel

---

## 1. Kontekst biznesowy (bez zmian od v2)

PDFCraft Studio to fork PDFCraft jako lead magnet AIwBiznesie (https://access-manager-tools-pdfcraft.vercel.app/pl/studio/). Cel: odwzorować Adobe Acrobat UX **przynajmniej od strony interfejsu**. User feedback (właściciel produktu): "chcę odwzorować Adobe Acrobat. NIE chcę przekierowywania zadania do odrębnego modułu".

**USP marki:** "Twoje pliki nigdy nie opuszczają Twojego urządzenia. Zero uploadu". Persystencja **musi być local** (IndexedDB), Supabase **tylko metadata** (opt-in), NIGDY blob plików.

## 2. Mental model docelowy (Acrobat MDI per właściciel + WebSearch confirm)

1. User wgrywa wiele plików → każdy = osobna **zakładka górna** (jak Chrome tabs)
2. User edytuje plik A (usuwa strony, reorder, zoom, scroll), przełącza na B → **wszystkie zmiany w A persisted in-memory** (page edits + viewState)
3. User klika File > Combine → **wizard pełnoekranowy** pyta "Które z otwartych zakładek łączyć?" (default: wszystkie zaznaczone) + reorder
4. Execute → **nowa zakładka C** ("Połączony N.pdf") powstaje, auto-switch, A i B **zostają otwarte**
5. Dalsze edycje na C są niezależne od A, B
6. **Persystencja przez Cmd+R** — user nie traci stanu po reload (z Recovery UX prompt)
7. **Cross-device:** opt-in metadata sync (lista nazw plików + ostatnio aktywne) — pliki nigdy nie opuszczają urządzenia

## 3. Stan obecny — REWIDOWANY (Codex wykrył braki w analizie v2)

### Co realnie ma `studioStore` (260 linii):
✅ `files: StudioFile[]` array, `currentFileId`, per-file `data: Uint8Array`, `version`
✅ Per-file edycje: `removePage(fileId, idx)`, `reorderPages(fileId, from, to)`, `replaceFileData(fileId, blob)`
✅ `getCurrentBuffer(id)` — lazy load oryginału

### Czego brakuje (krytyczne, NIE było w v2):
❌ **`currentPage` i `zoomLevel` są GLOBALNE**, nie per-file. `selectFile()` resetuje `currentPage` do 1 — łamie Acrobat mental model.
❌ **Brak per-file `scrollPosition`**, `selectedPages` (do operacji), `lastTool`.
❌ **Brak `dirtyFlags`** ani `unsavedSince` per file.
❌ **Brak undo history** w jakiejkolwiek formie.
❌ **`replaceFileData()` nadpisuje plik** — wiele tools (compress/encrypt/watermark) operują na całym buforze, NIE per-page. Per-op snapshot w undo nie pokrywa tego case'u.
❌ **Brak persistence layer** (poza wczorajszym `usePreferences()` cross-device sync, który mountuje się w `StudioLayout` i może się ścigać z każdym dodatkowym mount-time hydrate).

## 4. Architektura docelowa (Codex finding — separacja stores)

Zamiast monolithic `studioStore`, **dwa stores + cienki serwis**:

### 4.1. `StudioSessionStore` (in-memory, brak persist na poziomie store)
Trzymanie tab/UI/view state. Persist obsługiwany **na zewnątrz** przez `PdfDocumentRepository`.

```ts
interface TabState {
  id: string                 // tabId, NIE fileId
  documentId: string         // klucz do PdfDocumentRepository
  name: string               // tytuł na zakładce
  viewState: {
    currentPage: number
    zoomLevel: number
    scrollTop: number
  }
  pageCount: number | null
  version: number            // dirty indicator (>0 = edited)
  isDirty: boolean
  lastEditedAt: number | null
}

interface StudioSessionState {
  tabs: TabState[]
  activeTabId: string | null
  currentTool: StudioToolId  // global, NOT per-tab (Acrobat parity)
  showLeftSidebar: boolean
  showRightPanel: boolean
  showCombineWizard: boolean
  isProcessing: boolean

  // Tab management
  openTab: (documentId: string, name: string, pageCount: number | null) => string  // returns tabId
  closeTab: (tabId: string) => Promise<void>  // beforeunload prompt jeśli isDirty
  selectTab: (tabId: string) => void
  reorderTabs: (fromIdx: number, toIdx: number) => void

  // Per-tab view state (KLUCZOWA RÓŻNICA vs v2)
  setCurrentPage: (tabId: string, page: number) => void
  setZoom: (tabId: string, zoom: number) => void
  setScrollTop: (tabId: string, scrollTop: number) => void

  // Other
  selectTool: (tool: StudioToolId) => void
  toggleLeftSidebar: () => void
  toggleRightPanel: () => void
  openCombineWizard: () => void
  closeCombineWizard: () => void
}
```

### 4.2. `PdfDocumentRepository` (IndexedDB-backed, persist via `idb-keyval`)
Trzymanie dokumentów PDF (data + metadata + edit history). Async API.

```ts
interface PdfDocument {
  id: string
  name: string
  originalData: Uint8Array         // base, immutable po import
  currentData: Uint8Array          // current state po edits
  pageCount: number
  version: number                  // bumped przy każdym edit
  createdAt: number
  lastEditedAt: number | null
  // Replay-based undo (NIE snapshots — kluczowa decyzja vs v2)
  undoStack: PageOperation[]       // max 20 ops
  redoStack: PageOperation[]
}

type PageOperation =
  | { type: 'remove-page', pageIndex: number }                    // metadata only — replay z originalData
  | { type: 'reorder-pages', order: number[] }                    // permutation array
  | { type: 'replace-blob', blobName: string }                    // wskazuje na osobny blob w IDB (np. po compress)
  // 'replace-blob' przechowuje całość bo niereplayowalne (compress/encrypt/watermark)

class PdfDocumentRepository {
  async save(doc: PdfDocument): Promise<void>           // idb-keyval set
  async load(id: string): Promise<PdfDocument | null>   // idb-keyval get
  async delete(id: string): Promise<void>
  async listAll(): Promise<PdfDocument[]>
  async listIds(): Promise<string[]>
  async getQuotaStatus(): Promise<{ used: number, available: number, persistent: boolean }>
  async evictLRU(targetFreeMB: number): Promise<string[]>  // returns evicted IDs
}
```

### 4.3. `DocumentActions` (cienki serwis, łączy session + repository)
Wszystkie mutacje co dotykają obu stores przechodzą przez ten serwis. Eliminuje cross-store inconsistency.

```ts
class DocumentActions {
  constructor(
    private session: StudioSessionStore,
    private repository: PdfDocumentRepository
  ) {}

  async importFile(file: File): Promise<string>  // → returns tabId
  async closeTab(tabId: string): Promise<void>   // beforeunload prompt jeśli isDirty
  async removePage(tabId: string, pageIndex: number): Promise<void>
  async reorderPages(tabId: string, from: number, to: number): Promise<void>
  async replaceWithBlob(tabId: string, blob: Blob, newName?: string): Promise<void>
  async undo(tabId: string): Promise<void>  // pop z undoStack, replay
  async redo(tabId: string): Promise<void>
  async combineDocuments(tabIds: string[], outputName: string): Promise<string>  // → newTabId
}
```

## 5. Plan implementacji (4 fazy + dodatkowa Faza 0)

### Faza 0 (P0, 2-3h) — Architektura: separacja stores + per-tab viewState

**Pliki nowe:**
- `src/lib/stores/studioSessionStore.ts` — TabState[], view state, UI flags
- `src/lib/persistence/pdfDocumentRepository.ts` — class wrapper nad `idb-keyval`
- `src/lib/services/documentActions.ts` — facade

**Pliki do migracji:**
- `studioStore.ts` (260 linii) → migracja do nowej architektury, zachowanie API kompatybilności gdzie możliwe (tymczasowy adapter `useStudioStoreCompat()` dla istniejących komponentów)
- `PagesPanel.tsx`, `PdfViewer.tsx`, `ViewerToolbar.tsx` — odczyt `currentPage`/`zoom` z aktywnego taba (`activeTab.viewState.currentPage`), nie globalny
- `selectFile()` → `selectTab()` we wszystkich call sites
- 56 ToolComponents w `src/components/tools/*` — bez zmian (props `initialFile`/`onComplete` zostają, ale dostają plik z aktywnego taba przez `documentActions`)

**Migration strategy:**
1. Tworzymy nowe stores **obok** istniejącego `studioStore`
2. Adapter `useStudioStoreCompat()` re-eksportuje API dla legacy komponentów
3. Migrujemy komponenty po kolei (PagesPanel → PdfViewer → ViewerToolbar → tools)
4. Po pełnej migracji usuwamy `studioStore.ts` i adapter

**Acceptance criteria Faza 0:**
- Wgranie 2 plików → switch między nimi zachowuje per-file `currentPage`, `zoomLevel`, `scrollTop`
- Brak regresji w istniejących 56 narzędziach (smoke test 5 najczęściej używanych: split, merge, compress, rotate, watermark)
- Brak zmiany UI dla user'a — to czysto architektura (TabBar w Faza 1)

### Faza 1 (P0, 2-3h) — TabBar + Combine Wizard + ARIA + keyboard

**1a. Komponent `FileTabs.tsx` (nowy):**
- Górne zakładki, każda = `TabState` z `studioSessionStore.tabs`
- Per zakładka: nazwa pliku (truncate, **flexible width 120-200px** + tooltip — Acrobat ma stałą szerokość, my robimy lepiej), close `X`, **dirty indicator** kropka (gdy `tab.version > 0` lub `tab.isDirty`)
- Klik zakładki → `session.selectTab(tabId)`
- Drag-drop reorder (`@dnd-kit/core` Sortable)
- **ARIA:** `role="tablist"`, każda zakładka `role="tab"` + `aria-selected={isActive}` + `aria-controls={panelId}`. Viewer ma `role="tabpanel"` + `aria-labelledby={tabId}`
- **Keyboard:**
  - `Ctrl+Tab` / `Ctrl+Shift+Tab` — switch next/prev tab
  - `Ctrl+W` — close active tab (with `beforeunload` prompt jeśli `isDirty`)
  - `Ctrl+1`..`Ctrl+9` — switch to tab N
- Wstawiony w `StudioLayout` MIĘDZY `StudioMenuBar` a viewer (nowy row)
- **Dropdown w lewym panelu zostaje** (decyzja właściciela: "oba do końca")

**1b. `addCombinedFile` action w `DocumentActions`:**
- Tworzy nowy `PdfDocument` z combined blob
- Zapisuje do `PdfDocumentRepository`
- Otwiera nową zakładkę przez `session.openTab(...)` + auto-select

**1c. `CombineFilesWizard.tsx` (nowy, **pełnoekranowy view** zgodnie z Acrobat):**
- Trigger: klik "Połącz PDF-y" w drawer LUB `Plik > Połącz pliki` w menu bar
- **Pełnoekranowy view** (route `/studio/combine` LUB modal pokrywający 100% viewport, decyzja w czasie implementacji — modal prostszy, brak SSR)
- Lista wszystkich `tabs` z checkbox per plik (default all checked) + drag-reorder (`@dnd-kit/core` Sortable)
- Każdy plik ma expand button → thumbnail grid stron + opcja deselect per-page (Acrobat parity, nice-to-have, można odłożyć do v3.1)
- "Add Files…" button → dodaje nowe pliki (tab + dokument), auto-select w wizardzie
- Button "Połącz" enabled gdy ≥2 zaznaczone
- Execute: `documentActions.combineDocuments([tabId1, tabId2, ...], "Połączony N.pdf")` → nowy tab + auto-switch + close wizard
- **ARIA:** `role="dialog"` + `aria-modal="true"` + focus trap + `Esc` close

**1d. Smoke test (Playwright, automated):**
- Wgraj 2 PDF → 2 zakładki widoczne
- Kliknij "Połącz PDF-y" → wizard widoczny
- Confirm → 3 zakładki (test.pdf, test2.pdf, Połączony 1.pdf), auto-switch na ostatni
- Kliknij test.pdf → widoczny test.pdf, currentPage zachowane
- `Ctrl+W` na test.pdf → tab zamknięty (no prompt jeśli !isDirty)
- 0 console errors

**Acceptance criteria Faza 1:**
- Multi-file workflow działa end-to-end (open A, B, edit obu, combine → C)
- A11y audit Lighthouse score >90 dla aria-tabs
- Keyboard navigation działa (Tab przez wszystkie tabs, Ctrl+Tab switch, Ctrl+W close)

### Faza 2 (P0, 3-4.5h) — IndexedDB persistence + hydration gating + quota strategy

**2a. Library:** `idb-keyval` (~1 KB). Native `Uint8Array` support przez `structuredClone` — **NIE używamy `createJSONStorage`** (anty-pattern wykryty przez Qwen).

```ts
// src/lib/persistence/pdfDocumentRepository.ts
import { get, set, del, keys, values } from 'idb-keyval'

const DOC_PREFIX = 'pdf-doc-'

class PdfDocumentRepository {
  async save(doc: PdfDocument): Promise<void> {
    // structuredClone-able — Uint8Array, plain objects (NIE klasy)
    await set(DOC_PREFIX + doc.id, doc)
  }

  async load(id: string): Promise<PdfDocument | null> {
    return (await get(DOC_PREFIX + id)) ?? null
  }

  async delete(id: string): Promise<void> {
    await del(DOC_PREFIX + id)
  }

  async listIds(): Promise<string[]> {
    const allKeys = await keys()
    return allKeys
      .filter((k): k is string => typeof k === 'string' && k.startsWith(DOC_PREFIX))
      .map(k => k.slice(DOC_PREFIX.length))
  }

  async getQuotaStatus() {
    if (!('storage' in navigator) || !('estimate' in navigator.storage)) {
      return { used: 0, available: 0, persistent: false }
    }
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    const persistent = (await navigator.storage.persisted?.()) ?? false
    return { used: usage, available: quota - usage, persistent }
  }

  async requestPersistent(): Promise<boolean> {
    if (!('storage' in navigator) || !('persist' in navigator.storage)) return false
    return navigator.storage.persist()
  }

  async evictLRU(targetFreeMB: number): Promise<string[]> {
    const all = await values() as PdfDocument[]
    const sortable = all
      .filter((d): d is PdfDocument => !!d && typeof d === 'object' && 'lastEditedAt' in d)
      .sort((a, b) => (a.lastEditedAt ?? 0) - (b.lastEditedAt ?? 0))
    const evicted: string[] = []
    let freedBytes = 0
    const targetBytes = targetFreeMB * 1024 * 1024
    for (const doc of sortable) {
      if (freedBytes >= targetBytes) break
      const size = doc.currentData.byteLength + doc.originalData.byteLength
      await this.delete(doc.id)
      evicted.push(doc.id)
      freedBytes += size
    }
    return evicted
  }
}
```

**2b. Boot lifecycle (krytyczna sekwencja, Codex finding):**

`StudioLayout.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { useStudioSessionStore } from '@/lib/stores/studioSessionStore'
import { PdfDocumentRepository } from '@/lib/persistence/pdfDocumentRepository'

export function StudioLayout({ children }: { children: ReactNode }) {
  const [bootState, setBootState] = useState<'pending' | 'ready' | 'error'>('pending')
  const [restorePromptVisible, setRestorePromptVisible] = useState(false)
  const [persistedDocs, setPersistedDocs] = useState<PdfDocument[]>([])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        const repo = new PdfDocumentRepository()
        const ids = await repo.listIds()
        if (cancelled) return

        if (ids.length === 0) {
          setBootState('ready')
          return
        }

        // Recovery UX: pytaj user'a (NIE auto-restore)
        const docs = await Promise.all(ids.map(id => repo.load(id)))
        const valid = docs.filter((d): d is PdfDocument => d !== null)
        if (cancelled) return

        setPersistedDocs(valid)
        setRestorePromptVisible(true)
        setBootState('ready')
      } catch (err) {
        console.error('[StudioLayout] boot error', err)
        setBootState('error')
      }
    }
    boot()
    return () => { cancelled = true }
  }, [])

  if (bootState === 'pending') return <BootSpinner />
  if (bootState === 'error') return <BootErrorFallback />

  return (
    <>
      {restorePromptVisible && (
        <RestoreSessionPrompt
          docs={persistedDocs}
          onRestore={() => { /* otwórz wszystkie taby */ setRestorePromptVisible(false) }}
          onSkip={() => { /* clear repo */ setRestorePromptVisible(false) }}
        />
      )}
      {/* StudioHeader, StudioMenuBar, FileTabs, viewer, panels */}
    </>
  )
}
```

**Kluczowe decyzje:**
- **Boot gate** — nic nie renderuje viewer'a do `bootState === 'ready'`. Brak flicker / null state.
- **Recovery UX** — user widzi prompt "Miałeś otwarte X plików — przywrócić?" z 2 buttonami (Acrobat parity per WebSearch). NIE bezwarunkowe auto-restore.
- **Konflikt z `usePreferences()`** — sekwencja: (1) repository load (sync first), (2) restore prompt UI, (3) po decyzji user'a otwórz taby + dopiero wtedy `usePreferences()` może synchronizować preferences (theme, layout). `usePreferences()` mountuje się w viewer subtree, nie w boot gate.

**2c. `beforeunload` prompt:**
```tsx
useEffect(() => {
  const handler = (e: BeforeUnloadEvent) => {
    const hasDirty = useStudioSessionStore.getState().tabs.some(t => t.isDirty)
    if (hasDirty) {
      e.preventDefault()
      e.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', handler)
  return () => window.removeEventListener('beforeunload', handler)
}, [])
```

**2d. Auto-save lifecycle:**
- Każda mutacja przez `documentActions.*` → po success update `studioSessionStore` + `repository.save(doc)` (await, ale non-blocking dla UI)
- Debounce dla scroll/zoom (NIE auto-save view state na każdy event — co 500ms debounce)

**2e. Quota error handling:**
```ts
// W documentActions.replaceWithBlob:
try {
  await repository.save(doc)
} catch (err) {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    // Try LRU eviction
    const evicted = await repository.evictLRU(50) // 50 MB free
    if (evicted.length === 0) {
      throw new QuotaError('Brak miejsca w przeglądarce. Zamknij niepotrzebne zakładki.')
    }
    // Retry
    await repository.save(doc)
  } else {
    throw err
  }
}
```

User-facing: toast "Brak miejsca w pamięci przeglądarki — zamknięto N nieużywanych zakładek" lub "Zamknij niepotrzebne zakładki" gdy nawet eviction nie wystarczy.

**Acceptance criteria Faza 2:**
- Cmd+R z 2 plikami otwartymi → prompt "Przywrócić sesję?" → tak → 2 zakładki wracają z view state (currentPage, zoom)
- Cmd+R w private mode (Safari) → prompt nie wisi, fallback "Brak persistence — sesja czystą" (graceful)
- 500MB+ data → quota exceeded → eviction LRU → user widzi toast
- `beforeunload` prompt gdy zamykasz tab z dirty changes

### Faza 1.5 PO Fazie 2 (P1, 2-3h) — Undo/redo replay-based per document

**Strategia:** replay-based, NIE snapshots (Qwen + Codex zgodne).

**1.5a. Operations log:**
- `removePage` → `{ type: 'remove-page', pageIndex }` push do `undoStack` PRZED execute
- `reorderPages` → `{ type: 'reorder-pages', previousOrder: number[] }` (zachowujemy permutację PRZED move, replay = revert do tej permutacji)
- `replaceWithBlob` → `{ type: 'replace-blob', previousBlobId: string }` (poprzedni blob zachowany jako separate IDB entry, replay = restore z `previousBlobId`)

**1.5b. Undo execution:**
```ts
async undo(tabId: string): Promise<void> {
  const tab = session.getTab(tabId)
  const doc = await repository.load(tab.documentId)
  if (!doc || doc.undoStack.length === 0) return
  const op = doc.undoStack.pop()!
  doc.redoStack.push(op)

  switch (op.type) {
    case 'remove-page':
      // Replay z originalData + reapply wszystkie pozostałe ops (od początku)
      doc.currentData = await replayFromOriginal(doc.originalData, doc.undoStack)
      break
    case 'reorder-pages':
      doc.currentData = await applyOrder(doc.currentData, op.previousOrder)
      break
    case 'replace-blob':
      doc.currentData = (await repository.loadBlob(op.previousBlobId)) ?? doc.originalData
      break
  }
  doc.version += 1
  await repository.save(doc)
  // Notify session
  session.notifyDocumentChanged(tab.documentId)
}
```

**1.5c. Limit & memory:**
- `undoStack` max **20 ops** (auto-trim oldest)
- `redoStack` clearuje się po nowej operacji (standard pattern)
- `replace-blob` ops trzymają **previous blob jako osobny IDB entry** (keyed `pdf-blob-${id}`) — przy trim usuwamy też te bloby (eviction)

**1.5d. Keyboard:**
- `Ctrl+Z` → `documentActions.undo(activeTabId)`
- `Ctrl+Y` / `Ctrl+Shift+Z` → `documentActions.redo(activeTabId)`
- Disabled gdy active tab + undoStack/redoStack empty

**Acceptance criteria Faza 1.5:**
- Usuń stronę 2 z A → Ctrl+Z → strona 2 wraca
- Kompresuj A → Ctrl+Z → A wraca do oryginału
- Switch A→B→A → Ctrl+Z na A działa (per-tab stack izolowany — Acrobat parity)
- 21 ops na A → najstarsza zostaje auto-trimmed

### Faza 3 (P1, 1-2h) — Cloud sync metadata + opt-in + Recovery UX

**3a. Schema rozszerzenie `recent_documents` (już istnieje od wczoraj 760d134):**
```sql
ALTER TABLE recent_documents
  ADD COLUMN tab_state JSONB,            -- { tabs: [{ name, pageCount, lastEditedAt }], activeTabIndex }
  ADD COLUMN sync_enabled BOOLEAN DEFAULT FALSE;  -- opt-in
```

**3b. Settings UI (nowy):**
- W StudioMenuBar > Pomoc > Ustawienia → modal z toggle "Synchronizuj metadane między urządzeniami"
- Default OFF (opt-in per Codex finding — nazwy plików sensitive)
- Wyjaśnienie: "Twoje pliki nigdy nie opuszczają urządzenia. Synchronizujemy tylko nazwy ostatnio otwartych plików."

**3c. Hook `useTabStateSync()`:**
- Bridge między `studioSessionStore` ↔ Supabase `recent_documents.tab_state`
- Tylko gdy `user.preferences.sync_enabled === true`
- Debounce 5s — sync co najwyżej raz na 5s

**3d. Cross-device UX:**
- User otwiera Studio na drugim urządzeniu (zalogowany)
- Widzi prompt "Na innym urządzeniu miałeś otwarte: A.pdf, B.pdf — Wgraj ponownie te pliki?"
- Drag-drop zone na te konkretne nazwy
- USP zachowany — buffers tylko local

**Acceptance criteria Faza 3:**
- Toggle OFF default → brak żadnego sync do Supabase
- Toggle ON → po edycji w przeglądarce A, otwarcie w B pokazuje prompt z nazwami plików (bez ich zawartości)
- Privacy audit — `recent_documents.tab_state` NIE zawiera bufferów / blob URLs / hashes plików

### Faza 4 (P2, 1.5-2.5h) — Replikacja na pozostałe multi-input narzędzia

- `alternate-merge` (2→1 naprzemiennie) — używa `CombineFilesWizard` z innym execute callback (`pdf-lib` alternating merge)
- `grid-combine` (N→1 siatka) — wizard + dodatkowe options (rows, cols, padding)
- `repair` (multi-file batch) — wizard + execute per-file, returns ZIP

Każde narzędzie ~30-45 min refactor (kopiujemy `MergePDFTool` pattern).

## 6. Nowe estymaty (skorygowane przez cross-model review)

| Faza | v2 estymata | v3 skorygowana |
|------|-------------|----------------|
| Faza 0 (separacja stores + viewState) | — | **2-3h NEW** |
| Faza 1 (TabBar + Combine + ARIA + keyboard) | 2-3h | **2-3h** |
| Faza 2 (IDB persistence + hydration + quota) | 1.5-2h | **3-4.5h** |
| Faza 1.5 (undo replay-based) | 1h | **2-3h** |
| Faza 3 (cloud sync opt-in + recovery) | 1-1.5h | **1-2h** |
| Faza 4 (replikacja multi-input) | 1.5-2h | **1.5-2.5h** |

**Must-have MDI (Faza 0+1+2): 7-10.5h** (vs v2 est. 5-7h)
**Pełny scope (wszystkie fazy): 10.5-15h**

## 7. Dependencies

**NPM (do zainstalowania w Faza 2):**
- `idb-keyval@^6.2.1` — IndexedDB wrapper (~1KB gzipped)

**Już mamy:**
- `@dnd-kit/core` — TabBar reorder + Combine Wizard reorder
- `pdf-lib` — combine logic
- `next-intl` — i18n (PL/EN obecnie, multi-locale fallback)
- `zustand` — stores

## 8. Ryzyka i mitygacje

| Ryzyko | Prawdopodobieństwo | Impact | Mitygacja |
|--------|---|---|-----------|
| Migracja Faza 0 łamie 56 istniejących narzędzi | Średnie | Wysoki | Adapter `useStudioStoreCompat()` + smoke test 5 najczęstszych narzędzi przed merge Fazy 0 |
| Hydration race z `usePreferences()` | Wysokie | Średni | Boot gate w `StudioLayout` — viewer NIE rendererje do `bootState === 'ready'` |
| Quota exceeded na Safari iOS / private mode | Wysokie | Wysoki | `navigator.storage.persist()` + LRU eviction + user-facing toast + graceful fallback (no persistence, in-memory only) |
| Undo replay performance dla 50+ stron PDF + 20 ops | Niskie | Średni | Limit 20 ops, replay tylko PRZED original → linear time, ~1s dla 50 stron |
| Cross-device sync expose nazw plików bez user'a opt-in | Niskie | Wysoki (privacy/USP) | Default OFF, explicit toggle z wyjaśnieniem, audit że tab_state NIE zawiera bufferów |

## 9. Decision log (zatwierdzone przez właściciela)

- ✅ **Tabs górne** TAK + zostaje dropdown w lewym panelu (oba do końca)
- ✅ **Per-tab persistence in-memory** zmian podczas switching (Acrobat parity + lepiej)
- ✅ **Persystencja przez Cmd+R** (user nie gubi informacji — ulepszenie nad Acrobat)
- ✅ **WebSearch findings** zaakceptowane jako kontekst
- ✅ **Cross-model review GO_WITH_CHANGES** zaakceptowane → REWRITE v2 → v3
- 🔄 **Combine Wizard:** modal pełnoekranowy vs route — decyzja w czasie implementacji (preferred: modal, prostszy bez SSR considerations)
- 🔄 **Per-page expand w Combine Wizard:** odłożone do v3.1 (Acrobat ma, ale dodatkowy scope, można potem)

## 10. Strategia commitów

Per faza = osobny commit (atomic), każdy:
- Tytuł: `feat(studio): Faza N — opis`
- Body: lista konkretów + acceptance criteria
- Smoke test verified locally + Playwright PROD test gdzie możliwe

Po Fazie 0+1+2 (must-have MDI) → push to main → deploy Vercel → smoke test PROD przez Playwright → potwierdzenie OK przed Fazą 1.5.

Każda faza może być **rollback'owana** przez `git revert` jeśli krytyczny issue (architektura modułowa pozwala).

## 11. Open questions (do decyzji w czasie implementacji)

1. **Combine Wizard:** modal vs route `/studio/combine` — domyślnie modal (prostszy, brak SSR considerations); route gdyby trzeba było shareable URL (mało prawdopodobne)
2. **Tab right-click menu:** zostawić na v3.1 czy w Faza 1? Default: zostaw na v3.1 (focus na must-have)
3. **Undo persistence przez Cmd+R:** undoStack persisted (per-doc w IDB) — TAK (zachowuje się przez reload, jak edycje)
4. **Brand consistency:** czy "PDF Studio AIwBiznesie" pojawia się gdziekolwiek w nazwach combine output? Default: "Połączony N.pdf" (czyste, bez brand bleed)
