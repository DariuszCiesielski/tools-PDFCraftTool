# Handoff końcowy — 2026-05-08 19:25 CEST — Instrukcja dla następnego agenta

**Sesja:** ~11:00 → 19:25 CEST (~8h kalendarzowo, ~6h aktywnej pracy). Bardzo produktywna.
**Status repo:** czysty workdir, branch `main` synced z `origin/main`. **Nic nie zostało half-baked.**

---

## TL;DR — gdzie jesteśmy

PDFCraft Studio (Acrobat-style PDF editor, lead magnet AIwBiznesie) ma **wszystkie 4 fazy roadmap'y v3 LIVE** + 5 z 6 P2/P3 usprawnień zrobionych. Production: https://access-manager-tools-pdfcraft.vercel.app/pl/studio/

W jednej sesji dziś zrobiono:
- **Faza 2** (4 bugi: B1 multi-upload persist, B2/B3 false dirty, B5 orphan IDB) — fix + verified
- **Faza 3** (cross-device sync metadata, opt-in) — schema + UI + + bug HTTP 500 fix (NOTIFY pgrst)
- **Faza 1.5** (undo/redo replay-based dla 3 typów ops, Cmd+Z/Cmd+Shift+Z, menu Edycja)
- **Faza 4** (CombineFilesWizard mode prop dla alternate-merge, grid-combine, repair)
- **P2/P3 cleanup** (viewState cross-device restore, tabs order, dual-path unify, replaceFileData migracja)

Dariusz nie pracował nad inną funkcjonalnością w tej sesji — wszystko wykonane przez agenta po jego decyzji "działaj autonomicznie". 11 commitów na main pushed.

---

## Stan na 19:25 CEST

**Production deploy:** `ax6uoe0yp` (custom alias). Auto-deploy `qe3kxeb4m` ze 9dee1aa (handoff doc) jest tożsamy kodowo, alias nie aktualizowany bo nie warto.

**HEAD git:** `9dee1aa docs(handoff): 5 z 6 P-itemów zrobione w tej sesji`

**Commits dziś (od `04e35fd` rano):**
```
9dee1aa docs(handoff): 5 z 6 P-itemów zrobione w tej sesji
21cf9e1 refactor(studio): P2/P3 cleanup — viewState restore + tabs order + dual-path unify
d80921f docs(handoff): koniec sesji 2026-05-08 — Faza 2/3/1.5/4 wszystko LIVE + bug HTTP 500 fix
2485e49 fix(supabase): Faza 3 migration do repo + NOTIFY pgrst (HTTP 500 fix)
7da90a6 feat(studio): Faza 4 — CombineFilesWizard mode prop + 3 nowe narzędzia
278257b feat(studio): Faza 1.5 — undo/redo replay-based dla 3 typów ops
b4aaab2 feat(studio): Faza 3 — cross-device sync metadata (opt-in)
bdb372e fix(studio): Faza 2 B5 — restoreFromPersisted nie generuje nowych ID
f215f1d fix(studio): Faza 2 bugi — multi-upload persist + initial-load flag
04e35fd docs(handoff): koniec sesji 2026-05-08 — Faza 2 commit lokalny, deploy pending dla nowej sesji
```

**Zero blockerów. Zero half-baked features.**

---

## Co działa na produkcji (zweryfikowane smoke testem Playwright)

### Studio core
- 56 narzędzi w drawer (Wave-1 + Wave-2 + Wave-3 Phase A)
- MDI tabs (Acrobat-style) z per-tab viewState (currentPage, zoom, scroll)
- Auth Supabase (login/signup/signout)
- Polskie tłumaczenia (1858+ stringów)

### Faza 2 — IndexedDB persistence
- Boot gate przy starcie (pending → restore-prompt → ready)
- RestoreSessionPrompt po reload pokazuje listę plików
- Auto-persist eager przy upload (B1 fix — wszystkie pliki, nie tylko aktywny)
- `initialLoad` flag w `setFileData` (B2/B3 fix — brak false dirty)
- `restoreFromPersisted` używa istniejących ID (B5 fix — brak orphan docs)
- `tab order stable` po restore (P2.2 — sort po `createdAt`)

### Faza 3 — cross-device sync metadata (opt-in)
- Toggle w Pomoc → Ustawienia (default OFF, opt-in per Codex finding)
- `useTabStateSync` hook (debounce 5s, gate na `syncMetadataEnabled`)
- Synchronizowane: `file_name`, `content_hash` (SHA-256(name+size)), `page_count`, `current_page`, `zoom_level`, `scroll_top`, `order_index`, `is_active_tab`
- **NIE synchronizowane:** żadne buffery, blob URLs, hash zawartości pliku — USP "Twoje pliki nigdy nie opuszczają urządzenia" zachowany
- `updated_at` trigger (last-write-wins resolution)
- **viewState cross-device restore** (P2.1 — `handleRestoreSession` fetchuje `current_page`/`zoom_level`/`scroll_top`/`is_active_tab` z chmury po standardowym IDB restore)
- Migracja w repo: `supabase/migrations/20260508140000_faza3_tab_state_sync.sql`

### Faza 1.5 — undo/redo replay-based
- 3 typy operacji obsługiwane:
  - `remove-page` — replay-based od `originalData`
  - `reorder-pages` — replay-based z `newOrder` w stack
  - `replace-blob` — backward operation z osobnym IDB store (`pdfcraft-studio-blobs`) per blob snapshot
- Keyboard: Cmd/Ctrl+Z (undo), Cmd/Ctrl+Shift+Z lub Cmd/Ctrl+Y (redo)
- Skipuje gdy focus w INPUT/TEXTAREA/SELECT/contentEditable
- Menu Edycja w pasku menu (między Plik a Widok)
- UndoStack max 20 ops (slice -20)

### Faza 4 — CombineFilesWizard z 4 trybami
- `merge` (≥2): zwykłe łączenie PDF
- `alternate-merge` (≥2): naprzemienne łączenie 2 PDF (1A,1B,2A,2B...)
- `grid-combine` (≥2): N PDF do siatki 2×1 / 2×2 / 3×3 (UI radio)
- `repair` (≥1): batch repair przez qpdf-wasm, każdy plik → nowy tab
- Wszystkie używają istniejących processorów z `src/lib/pdf/processors/`

### P3 architecture cleanup
- `studioStore.removePage`/`reorderPages` → cienkie delegaty do `documentActions.*`
- `documentActions` po operacji wywołuje `syncStudioFromRepo(tabId)` — eliminuje desynchronizację studioStore.files vs repo
- `studioStore.replaceFileData` USUNIĘTY (dead code po migracji ToolDrawer na `documentActions.replaceWithBlob`)

---

## Pending — co odłożone do następnej sesji

### P0 / P1 — żadne (sesja zamknięta cleanly)

### P2.3 — Faza 5: read-side UI "Continue from another device"

**Scope:** Cross-device sync zapis działa (Faza 3). Brak read-side UX — user na drugim urządzeniu nie widzi listy plików z innych urządzeń.

**Co zaprojektować:**
1. **Modal lub panel** — "Pliki z innych urządzeń" — lista nazw + ostatnia data otwarcia (z `recent_documents.last_opened_at`)
2. **Click na nazwę** — user uploaduje plik lokalnie (drag-drop z prompt'em "Wybierz plik tej samej zawartości")
3. **Matching strategy** — porównaj content_hash przy upload. Jeśli matchuje → użyj cached metadata (current_page, zoom). Jeśli nie matchuje → traktuj jako nowy plik, nadpisz w `recent_documents`.
4. **Edge cases do rozważenia:**
   - User uploaduje plik o tej samej nazwie ALE innej zawartości (różny `content_hash`) → conflict resolution
   - Plik z chmury nie ma odpowiednika lokalnie → pokazać jako "available from other device"
   - Multiple devices nadpisują metadata na tej samej nazwie pliku — last-write-wins via `updated_at` (już mamy trigger)
5. **UI placement** — sidebar "Recent" w File menu? Osobny modal? Pomoc w decyzji.

**Estymata:** ~2-3h aktywnej pracy. Wymaga:
- Nowy komponent `CloudFilesPanel` lub modal
- Nowa metoda `documentActions.openFromCloud(metadata)` 
- Translations
- Smoke test (logowanie cross-device, weryfikacja matching)

### Inne pomysły (bez priorytetu, mogą wyniknąć z user feedback)

- **Realtime subscriptions** — gdy user otworzy plik na urządzeniu A, urządzenie B widzi update bez reload
- **Per-document sync toggle** — global toggle za szeroki dla niektórych użytkowników, granularne włączanie sync na konkretnych plikach
- **Multi-file batch ZIP w repair** — handoff 13:00 wspomniał, ale każdy plik → osobny tab jest UX-friendlier (Faza 4 zrobiona tak)
- **CombineFilesWizard rozszerzenie o 5+ tryby** — np. `linearize` (web optimize) jako multi-file batch

---

## Instrukcja dla następnego agenta na start

### Krok 1 — orientacja (5 min)

```bash
cd ~/projekty/Access\ Manager/tools-PDFCraftTool
git log --oneline -10  # potwierdź HEAD na 9dee1aa lub kolejnym
git status  # powinno być clean
```

Przeczytaj **w tej kolejności:**
1. **Ten handoff** — pełny kontekst dnia
2. `handoff-2026-05-08-1620-koniec-faza-2-3-1-5-4-wszystko-LIVE.md` — szczegóły każdej fazy
3. `handoff-2026-05-08-1300-faza-0-1-2-mdi-acrobat-deploy-2-pending.md` — plan v3 z cross-model review (architektoniczne decyzje)

### Krok 2 — przed kodowaniem cokolwiek

**Zasady przed kodowaniem (z dzisiejszych lekcji):**

1. **Migracje DDL ZAWSZE w `supabase/migrations/`** + `NOTIFY pgrst, 'reload schema'`. Bez tego REST API zwraca HTTP 500 (`feedback_supabase_alter_table_notify_pgrst.md` w globalnej pamięci). Idempotent (`IF NOT EXISTS`) ratuje gdy schema już w prod.

2. **Vercel alias multi-agent race** (`feedback_vercel_alias_multi_agent_race.md`) — przed `vercel alias set` sprawdź czy nie ma równoległej sesji (sprawdź `.ai/handoffs/` z ostatnich 5 min).

3. **Przed deployem**: `npx tsc --noEmit` (szybko, bez emit). Pre-existing errors w `__tests__/properties/` można ignorować — to nie nasz kod.

4. **Pattern dla nowych operacji**: dodajesz nową PDF operację? Idź ścieżką `documentActions.X(tabId, args)` które:
   - Loaduje doc z repo
   - Wykonuje pdf-lib operację
   - Push op do undoStack (jeśli undowable)
   - Save do repo
   - `session.updateTabMeta(tabId, { ... })`
   - **`await syncStudioFromRepo(tabId)`** ← KRYTYCZNE, bez tego PdfViewer pokaże stary buffer
   - Jeśli undowable, dodaj `applyOpForward` case w `documentActions.ts` żeby undo/redo działało

5. **Dual-path zlikwidowany** — `studioStore.removePage`/`reorderPages` to delegaty. Nie dodawaj nowej operacji w studioStore — wszystko przez `documentActions`.

### Krok 3 — Forced challenge questions (per §27 globalnego CLAUDE.md)

Zanim zaczniesz robić P2.3 (jeśli to jest tematem) lub jakąkolwiek nową funkcjonalność:

1. **Scope** — czy P2.3 jest minimum do osiągnięcia celu? Może jest mniejsza wersja MVP?
2. **Alternatywy** — czy istnieje istniejący wzorzec w ekosystemie (np. SOTA RAG, Marketing Hub) który już rozwiązuje "cross-device files browser"?
3. **Duplikacja** — czy `useRecentDocuments` (już w PDFCraft, używany dla File menu Recent) nie pokrywa już 80% scope'u? Może rozszerzenie istniejącego dropdownu zamiast nowego modal?

Dariusz lubi pragmatyczne rekomendacje przed kodowaniem.

### Krok 4 — komunikacja z Dariuszem

- **Pisz po polsku.** Zawsze.
- **Krótko** (max 5-10 linii dla typowych odpowiedzi). Patrz §2 globalnego CLAUDE.md.
- **NIE pytaj o użycie modeli lokalnych** (Qwen, Codex, Mistral). Po prostu informuj 1 linią. (Memory: `feedback_modele_lokalne_bez_akceptacji.md`)
- **NIE pokazuj surowego markdown** jako treści — patrz §29. Email/wiadomość → format jak email; tabela → markdown table OK; długi raport → naturalny tekst z pogrubieniami.
- **Krytykuj jeśli widzisz lepszy kierunek** (§20). Asymetria wiedzy: technika = ucz, biznes = słuchaj.
- **Estymaty zawsze 2 liczby** — realna praca + bufor dla klienta (§17).

### Krok 5 — gdy kontekst się kończy

Per §11 — zapisz handoff do `.ai/handoffs/handoff-YYYY-MM-DD-HHMM-<temat>.md`. Nazwa pliku unikalna (kolizja między równoległymi sesjami).

---

## Pułapki specyficzne dla PDFCraft (do uniknięcia)

1. **`vercel --prod` może odłączać HEAD** — dziś jeden raz było `git checkout` do detached state po deploy. Po deploy zawsze sprawdź `git status -sb`. Jeśli detached → `git checkout main`.

2. **Beforeunload prompt blokuje Playwright reload** — w testach trzeba override `Event.prototype.preventDefault` dla `beforeunload`. Pattern w `handoff-2026-05-08-1620-...` linia ~700 (smoke testy).

3. **Playwright MCP roots ograniczone do Project Master** — testowe PDF kopiuj do `/Users/dariuszciesielski/projekty/Project Master/.playwright-mcp/`. Reportlab generator pattern: zobacz handoff.

4. **`useAuthOptional()` zamiast `useAuth()`** dla komponentów dzielonych między różne layouty (klasyczne `/tools/[tool]/` nie mają AuthProvider). Faza 5 read-side UI musi to uwzględniać.

5. **`useTabStateSync` debounce 5s** — przy szybkim teście user widzi "nic się nie sync'uje" przez 5s. Dla smoke pamiętaj `await new Promise(r => setTimeout(r, 7000))`.

6. **PostgREST schema cache** — po każdym ALTER TABLE zawsze NOTIFY pgrst (pkt 1 wyżej).

---

## Decyzje architektoniczne — nie zmieniać bez powodu

1. **`tabId === documentId`** w Fazie 0 (1:1 mapping). Nie wprowadzać N:1 (jeden dokument w 2 tabs) bez konkretnego use case.

2. **Default OFF dla `sync_metadata_enabled`** — Codex finding 8.05. Mimo że Qwen sugerował ON dla UX, USP "Twoje pliki nigdy nie opuszczają urządzenia" jest priorytetem. Nie zmieniać bez explicit user request.

3. **content_hash = SHA-256(name+size) na 16 hex** — Qwen R1. Stabilny cross-device, kolizja prawdopodobna na ~4 mld plików. NIE używać `lastModified` (zmienia się przy zapisie kopii).

4. **Per-document tab_state w osobnych kolumnach** zamiast JSONB — Qwen R3. Łatwiejsze indeksowanie, migracje. Nie zmieniać.

5. **UndoStack max 20 ops** (slice -20). UndoBlobs `pdfcraft-studio-blobs` w osobnym IDB store, deletowane przy undo.

6. **Match po `file_name` w cross-device viewState restore** (P2.1) — `recent_documents` ma UNIQUE(user_id, file_name), więc deterministyczne.

---

## Live deploy reference

- **Production:** https://access-manager-tools-pdfcraft.vercel.app/pl/studio/
- **Custom alias points to:** `ax6uoe0yp` (commit `21cf9e1`, P2/P3 cleanup)
- **Latest auto-deploy:** `qe3kxeb4m` (commit `9dee1aa`, doc-only — kod identyczny z `ax6uoe0yp`)
- **Supabase project "PDF Studio":** `wvjoeyulugbpovhjboag` (eu-central-1 Frankfurt). Credentials w `~/.claude/shared-credentials.env` (`PDFCRAFT_STUDIO_*`).
- **Test PDFs:** `/Users/dariuszciesielski/projekty/Project Master/.playwright-mcp/test.pdf` (2 strony) + `test2.pdf` (1 strona)
- **GitHub repo:** `DariuszCiesielski/tools-PDFCraftTool` (private)

---

## Kontekst osobisty

Dariusz pracuje w Cursor IDE (NIE proponuj "nowy terminal"). Sesja zamknięta cleanly — nie ma pending fixów ani blocker'ów. Następna sesja może spokojnie zacząć od czystej karty albo P2.3 albo czegokolwiek nowego co Dariusz zaproponuje.

**Status:** ZAMKNIĘTE.
