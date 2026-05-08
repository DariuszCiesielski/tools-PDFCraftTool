# Handoff — 2026-05-08 ~13:00 CEST → kontynuacja PDFCraft Acrobat MDI

**Status:** Fazy 0+1 LIVE PROD ✅, Faza 2 zacommitowana lokalnie (NIE deployed) ⏳
**Powód handoff:** sesja długa, kontekst się kończy. Nowa sesja zaczyna od deploy + smoke test Fazy 2.

## TL;DR — pierwszy krok w nowej sesji

```bash
cd ~/projekty/Access\ Manager/tools-PDFCraftTool
git log --oneline -6  # potwierdź a68c5bd jako HEAD lokalny

# 1. Deploy Faza 2 na produkcję
vercel --prod --yes
# Po success: zaalisuj manualnie (per lekcja 7.05)
vercel alias set <new-direct-url>.vercel.app access-manager-tools-pdfcraft.vercel.app

# 2. Smoke test Cmd+R przez Playwright (kluczowe — czy IDB persistence działa)
# - navigate /pl/studio
# - login dariusz.ciesielski.71@gmail.com / RingGard11!
# - upload 2 PDF z .playwright-mcp/test.pdf + test2.pdf
# - reload page (browser_navigate na ten sam URL)
# - VERIFY: pojawia się RestoreSessionPrompt z 2 plikami
# - klik "Przywróć sesję" → 2 zakładki wracają z page count
```

## Stan produkcji (przed deploy Fazy 2)

`https://access-manager-tools-pdfcraft.vercel.app/pl/studio/` — deploy `j9hri352w` (commit 6e6d62b)

Działa zweryfikowane Playwright:
- Tabs górne (test.pdf | test2.pdf) z dirty indicator + close + ARIA
- Per-tab viewState (currentPage zachowane przy switch)
- Combine Wizard pełnoekranowy → "Połączony 1.pdf" jako 3 zakładka, oryginały zostają

## Commity dziś (od main)

```
a68c5bd feat(studio): Faza 2 — IndexedDB persistence + Recovery UX + beforeunload  ← lokalnie, NIE deployed
6e6d62b fix(studio): combineDocuments fallback do studioStore.files                  ← LIVE
7e23471 feat(studio): Faza 1 — TabBar + Combine Wizard pełnoekranowy                ← LIVE
cc64191 feat(studio): Faza 0 — Acrobat MDI architecture                             ← LIVE
b108599 fix(studio): split tool prefilled z current PDF (Acrobat pattern)           ← wczoraj
6739a94 fix(studio): redirect to login landing after sign-out                       ← wczoraj
```

## Plan dalszy (Plan v3 sekcje 5.4-5.6)

Pełen plan: `.ai/reviews/2026-05-08-acrobat-mdi-plan.md` (v3, post-cross-model review)

### Faza 1.5 (P1, 2-3h) — Undo/redo replay-based
**MUSI być po Fazie 2 (per cross-model review)** — undo bez persistence bezużyteczne po Cmd+R.

Pliki do zmiany:
- `src/lib/services/documentActions.ts` — dodać `undo(tabId)` + `redo(tabId)` actions
  - Wzorzec replay z `originalData` + reapply ops PRZED ostatnią
  - `removePage` op: pop, replay od zera
  - `reorderPages` op: pop, applyOrder(previousOrder)
  - `replace-blob` op: pop, restore z previousBlobId (osobny IDB entry `pdf-blob-${id}`)
- `src/lib/stores/studioStore.ts` — w `setFileData/setPageCount` PUSH op do `doc.undoStack` (limit 20, auto-trim)
  - Już mamy infrastructure undoStack w `PdfDocument` (Faza 0)
- `src/components/studio/PdfViewer.tsx` LUB nowy hook `useStudioKeyboard.ts` — global listener Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
- `src/components/studio/StudioMenuBar.tsx` — dodać Edycja > Cofnij / Ponów (linia ~226 gdzie są inne menu items)

**Gotcha:** `replaceFileData` w pdf-lib wymaga że previousBlobId istnieje jako osobny IDB entry. Trzeba zapisać `previousData` JAKO osobny blob przed `replaceFileData`. To NIE jest snapshot w stack (co pamiętali Qwen/Codex jako anti-pattern), tylko 1 osobny entry z LRU eviction.

### Faza 3 (P1, 1-2h) — Cloud sync metadata + opt-in + Recovery UX (web)

**Schema rozszerzenie `recent_documents`** (już istnieje od commitu 760d134 wczoraj):
```sql
ALTER TABLE recent_documents
  ADD COLUMN tab_state JSONB,
  ADD COLUMN sync_enabled BOOLEAN DEFAULT FALSE;
```
Migracja w Supabase project "PDF Studio" (`wvjoeyulugbpovhjboag`, eu-central-1 Frankfurt). Credentials w `~/.claude/shared-credentials.env` (`PDFCRAFT_STUDIO_*`).

Pliki:
- `src/lib/hooks/useTabStateSync.ts` (NEW) — bridge studioSessionStore.tabs ↔ Supabase recent_documents.tab_state, debounce 5s
- `src/components/studio/StudioMenuBar.tsx` (linia ~280-330 gdzie jest dropdown Pomoc) — dodać Pomoc > Ustawienia → otworzyć modal z toggle "Synchronizuj metadane między urządzeniami" (default OFF, opt-in per Codex finding)
- `src/components/studio/SettingsModal.tsx` (NEW) — toggle + wyjaśnienie "Twoje pliki nigdy nie opuszczają urządzenia. Synchronizujemy tylko nazwy."
- `src/lib/hooks/usePreferences.ts` — extend o `sync_enabled` field

**USP audit przed deploy:** `recent_documents.tab_state` przykład value — POKAZAĆ Dariuszowi w terminalu (psql query) żeby potwierdził że NIE ma bufferów / blob URLs / hashes.

### Faza 4 (P2, 1.5-2.5h) — Replikacja CombineFilesWizard

3 narzędzia multi-input do migracji na wzorzec wizard:
- `alternate-merge` (2→1 naprzemiennie) — `src/components/tools/alternate-merge/AlternateMergeTool.tsx`
- `grid-combine` (N→1 siatka, opcje rows/cols/padding) — `src/components/tools/grid-combine/GridCombineTool.tsx`
- `repair` (multi-file batch ZIP) — `src/components/tools/repair/RepairPDFTool.tsx`

Każde:
1. Dodać tool ID do `COMBINE_WIZARD_TOOLS` w `src/components/studio/ToolsPanel.tsx:130`
2. Rozszerzyć `CombineFilesWizard` o **mode prop** — `'merge' | 'alternate-merge' | 'grid-combine' | 'repair'`
3. Per mode: różny `documentActions.combineDocuments` callback (alternate uses pdf-lib alternating logic, grid uses N-up combine, repair uses multi-file batch)

**Decyzja architektoniczna**: opcja A (jeden wizard z mode prop) vs opcja B (osobne wizardy per narzędzie). Rekomendacja: A — minimum kodu, łatwiej maintain.

## Architektura — co jest, czego brakuje

### Stores (po Fazie 0)
- `studioStore.ts` — legacy, zostaje do pełnej migracji w Fazie 3+. Bridge propaguje do sessionStore.
- `studioSessionStore.ts` — tabs[] z per-tab viewState. Active store dla TabBar/PdfViewer/PagesPanel/ViewerToolbar.
- `pdfDocumentRepository.ts` — IndexedDB-backed (Faza 2 LIVE w lokalnym commitcie). API async-first.
- `documentActions.ts` — facade. Aktualnie: combineDocuments, removePage, reorderPages, replaceWithBlob, createDocumentFromBlob, importFiles, getCurrentBuffer, getDocument.

### Bridge studioStore → sessionStore
Linia `src/lib/stores/studioStore.ts:52-92` — addFiles propaguje do sessionStore.openTab + persistDocument do IDB. setFileData → updateTabMeta + persistDocument.

### Co jeszcze powinno być (debt, nie blokujący)
- Migracja 11 komponentów na bezpośrednie czytanie z sessionStore (PageThumbnails, StudioFooter, StudioMenuBar, ToolDrawer, ToolsPanel, StudioHeader, StudioDropZone, usePreferences). Aktualnie używają legacy studioStore. To debt z Fazy 0 — działa, ale pełna migracja czystsza.
- `studioSessionStore.tabs[].viewState.scrollTop` jest w typie ale NIE jest pisane (PdfViewer.tsx scroll handler nie istnieje). Niepilne — currentPage/zoom wystarcza dla UX.
- Krzyż-store ID mapping zakłada **tabId === documentId === studioFileId** (Faza 0 simplification). Faza 4+ może wymagać N:1 (jeden dokument w 2 zakładkach).

## Pliki kluczowe

```
src/lib/stores/studioSessionStore.ts          # 240 linii — TabState[], viewState, openTab/closeTab/selectTab
src/lib/stores/studioStore.ts                 # legacy + bridge — auto-persist do IDB w setFileData (Faza 2)
src/lib/persistence/pdfDocumentRepository.ts  # IndexedDb + InMemory fallback, idb-keyval, quota strategy
src/lib/services/documentActions.ts           # facade — combineDocuments + removePage + reorderPages + replaceWithBlob
src/components/studio/FileTabs.tsx            # zakładki górne, ARIA, keyboard Ctrl+Tab/W/1-9
src/components/studio/CombineFilesWizard.tsx  # modal pełnoekranowy, ARIA dialog, dnd-kit reorder
src/components/studio/RestoreSessionPrompt.tsx # Faza 2 — recovery UX po reload
src/components/studio/StudioLayout.tsx        # boot gate (pending/restore-prompt/ready), beforeunload
.ai/reviews/2026-05-08-acrobat-mdi-plan.md    # Plan v3 (post-cross-model review)
.ai/reviews/2026-05-08-acrobat-mdi-plan-summary.md # Werdykt zbiorczy
.playwright-mcp/test.pdf, test2.pdf           # PDF do smoke testu E2E (test.pdf 2 strony, test2.pdf 1 strona)
```

## Lessons learned dziś

1. **Cross-model review przed implementacją to nie luksus.** Plan v2 miał `currentPage` globalne — Codex znalazł w 5 min, byłaby regresja Acrobat parity. Replay-based undo zamiast snapshots zapobiegł 500MB RAM bloat. Kosztu $0 (Qwen + Codex), oszczędność dni debugowania. Per §25 OBOWIĄZKOWE dla architektury.

2. **JSON.stringify(Uint8Array) anti-pattern** — `createJSONStorage` w Zustand persist BAZOWALI base64 (+33% bloat). Użyć native `idb-keyval` z `structuredClone`.

3. **App Router hydration race** — Zustand persist + `usePreferences()` mountują się obie na `useEffect`, kolizja. Boot gate (`bootState`) eliminuje race.

4. **`tabId === documentId` simplification** w Faza 0 znacząco upraszcza mapping. Refactor do N:1 dopiero gdy konkretny use case (np. zakładka A i kopia A osobno).

5. **Fallback w combineDocuments** — bug w smoke test: zwykły upload przez addFiles tworzy tab ale NIE doc w repo. Fallback z fetchowaniem z studioStore.files naprawia. Faza 2 (auto-persist w setFileData) eliminuje gap dla nowych przypadków, ale fallback zostaje dla legacy.

6. **vercel alias auto-promote zawodzi** — 5× w 2 dniach. Zawsze manual `vercel alias set` po `--prod`.

## Pytania do Dariusza (gdy wróci)

- Czy rozważyć opcję A (jeden CombineFilesWizard z mode prop) vs B (osobne wizardy) dla Fazy 4? — rekomendacja: A
- Czy w Fazie 1.5 dodać też menu "Edycja" w StudioMenuBar (Cofnij/Ponów/Wytnij/Kopiuj/Wklej)? Czy tylko keyboard shortcuts? — rekomendacja: oba dla discoverability
- Czy w Fazie 3 sync_enabled default OFF (Codex finding) jest OK, czy dla 1-user MVP daj default ON? — rekomendacja: OFF (USP "Twoje pliki nigdy nie opuszczają")

## Kontekst osobisty

Dariusz "nie czuł się najlepiej" przed handoff'em. Sesja może być wznowiona w dowolnym momencie. Brak deadlinu na Fazy 1.5/3/4 — Faza 1+2 + Combine wystarczają na demo lead magnet.

---

**Status:** ZAOTWARTE
