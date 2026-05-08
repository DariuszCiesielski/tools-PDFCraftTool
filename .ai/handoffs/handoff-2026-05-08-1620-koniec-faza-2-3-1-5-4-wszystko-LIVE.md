# Handoff koniec sesji — 2026-05-08 16:20 — Faza 2/3/1.5/4 wszystko LIVE

**Status:** ZAOTWARTE — wszystko zaadresowane, brak otwartych blockerów.
**Sesja:** 11:00 → 16:20 (~5h aktywnej pracy). Bardzo produktywna — 4 fazy wdrożone w jednej sesji.

## TL;DR

Wszystkie 4 fazy LIVE i zweryfikowane smoke testem. **HEAD: `2485e49`** (po fix Fazy 3).
Custom alias `https://access-manager-tools-pdfcraft.vercel.app` → deploy `17xzenl4c` (Faza 4).

| Faza | Status | Smoke | Komentarz |
|---|---|---|---|
| Faza 2 (B1/B2/B3/B5 fixes) | ✅ LIVE | ✅ verified | multi-upload persist, dirty flag, restore bez orphan |
| Faza 3 (cross-device sync) | ✅ LIVE | ✅ HTTP 200 | toggle + USP audit + DB content verified |
| Faza 1.5 (undo/redo) | ✅ LIVE | ✅ Cmd+Z/Shift+Z | replay-based dla 3 typów ops |
| Faza 4 (Wizard mode prop) | ✅ LIVE | ✅ 3 modes | alternate-merge, grid-combine, repair |

## Ważny incydent (już naprawiony): bug HTTP 500 Fazy 3

Sesja równoległa PM (handoff 16:00) wykryła HTTP 500 na upsert do `recent_documents`. Root cause:

1. **PostgREST schema cache stale** po `ALTER TABLE` (zaaplikowany przez psql direct 13:00)
2. **Migracja NIE w repo** (tylko prod via psql) — pattern z lekcji 2026-04-27 PM

**Fix (2 commits):**
- `2485e49 fix(supabase): Faza 3 migration do repo + NOTIFY pgrst`
- Reload PostgREST: `psql -c "NOTIFY pgrst, 'reload schema';"`

**Weryfikacja po fix:**
- POST `/rest/v1/recent_documents` z FULL columns (content_hash, page_count, ...) → **HTTP 200**
- DB content potwierdza sync metadata (test.pdf hash `5e9b067fada8bce5`, test2.pdf `d1ae561eeb08a2ea`)
- Zero console errors
- USP zachowany — w DB tylko metadata, ZERO buffer/blob/binary content

## Commits dnia (od `04e35fd` handoff początkowy)

```
2485e49 fix(supabase): Faza 3 migration do repo + NOTIFY pgrst (HTTP 500 fix)
7da90a6 feat(studio): Faza 4 — CombineFilesWizard mode prop + 3 nowe narzędzia
278257b feat(studio): Faza 1.5 — undo/redo replay-based dla 3 typów ops
b4aaab2 feat(studio): Faza 3 — cross-device sync metadata (opt-in)
bdb372e fix(studio): Faza 2 B5 — restoreFromPersisted nie generuje nowych ID
f215f1d fix(studio): Faza 2 bugi — multi-upload persist + initial-load flag
04e35fd docs(handoff): koniec sesji 2026-05-08 — Faza 2 commit lokalny, deploy pending
```

Wszystko pushed do `origin/main`.

## Lekcje sesji (do pamięci globalnej)

1. **`NOTIFY pgrst, 'reload schema'` po każdym ALTER TABLE.** Bez tego REST API zwraca HTTP 500 dla nowych kolumn (cache stale). Konkretnie tu: psql direct bypass'ował Supabase CLI workflow który zwykle trigger-uje reload.

2. **Migracje DDL ZAWSZE w `supabase/migrations/`** — nie tylko prod via psql/MCP. Ten pattern był naruszony 13:00 (impl Fazy 3) i wywołał bug PM 15:30+. Idempotent migration (`IF NOT EXISTS`) ratuje gdy schema już jest w prod.

3. **Race condition Vercel CLI alias set** między równoległymi sesjami — handoff PM 16:00 zauważył że jego alias nadpisany moim. Last-writer-wins. Sugestia: lock file `.vercel-alias-lock` z mtime check przed alias set. Do BACKLOG (lower priority — multi-agent workflow rzadko).

4. **Linter/auto-action może detach HEAD** — w trakcie sesji ktoś (post-commit hook?) zrobił `git checkout bdb372e`, odłączył HEAD od `main`. Commits Faza 3 + 1.5 były w reflog, fix: `git checkout main`. Do BACKLOG: zbadać który hook to robi.

## Pending dla następnej sesji

### P1 — żadne (sesja zamknięta cleanly)

### P2 — opcjonalne usprawnienia

- **viewState restore po reload** — currentPage/zoom NIE wraca po Restore Session (B4 z handoffu 13:00). Faza 3 ma pole `current_page` w `recent_documents` ale RestoreSessionPrompt nie czyta z chmury, tylko z IDB. Fix: bridge na restore z chmury jeśli `sync_metadata_enabled=true`.

- **Kolejność tabs po restore** zmienia się czasem (test2 pierwszy zamiast test) — `idb-keyval listAll` nie gwarantuje insertion order. Fix: dodać `created_at` do `PdfDocument` i sort po nim w `restoreFromPersisted`.

- **Faza 3 read-side**: "Recent docs from another device" UI — pokazuje listę nazw z chmury (bez plików), klik = upload pliku w nowym device matchowany po `content_hash`. Faza 3 zrobiona tylko WRITE-side.

- **Lock file dla Vercel alias** (race condition multi-agent).

### P3 — debt z Fazy 1.5

- `studioStore.replaceFileData` (linia 334-352) NIE pushuje do undoStack ani nie persists do repo. Aktualnie nieużywany w produkcji ale jeśli ktoś go wywoła, undo nie zadziała. Albo: usunąć jako dead code, albo: zmigrować do documentActions.replaceWithBlob.

- Dual code path `studioStore.removePage` vs `documentActions.removePage` — oba pushują do undoStack ale różnymi kanałami. Zunifikować przy okazji.

## Co działa na produkcji TERAZ

- 56 narzędzi w drawer (Wave-1 + Wave-2 + Wave-3 Phase A)
- MDI tabs z per-tab viewState
- IDB persistence + Recovery prompt
- Cross-device sync metadata (opt-in via Pomoc → Ustawienia)
- Undo/Redo Cmd+Z/Cmd+Shift+Z + menu Edycja
- 4 wizardy multi-input: merge, alternate-merge, grid-combine (2×1/2×2/3×3), repair
- Polskie tłumaczenia (1858+ stringów)
- Auth Supabase + cross-device sync user_preferences

## Reference

- **Production**: https://access-manager-tools-pdfcraft.vercel.app/pl/studio/
- **Latest deploy**: `17xzenl4c` (commit `7da90a6`, Faza 4)
- **Migration repo**: `supabase/migrations/20260508140000_faza3_tab_state_sync.sql` (commit `2485e49`)
- **Test PDFs** (dla Playwright smoke): `.playwright-mcp/test.pdf` (2 strony) + `.playwright-mcp/test2.pdf` (1 strona) — generowane Pythonem reportlab

---

**Status:** ZAMKNIĘTE — wszystko działa, brak otwartych zadań krytycznych. Następna sesja może zacząć od czystego stanu albo od jednego z P2 items.
