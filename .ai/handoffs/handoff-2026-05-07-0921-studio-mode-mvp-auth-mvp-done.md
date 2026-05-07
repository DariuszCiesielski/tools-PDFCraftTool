# Handoff 2026-05-07 ~09:21 — PDFCraft Studio Mode MVP + Auth MVP gotowe

**Czas sesji:** 05:45 → 09:21 CEST (~3.5h aktywnej pracy)
**Status:** Studio Mode MVP + Auth MVP zaimplementowane na branchu `feat/studio-mode`. Kontynuacja — krok 1 listy poniżej.

## TL;DR

Zbudowany `/[locale]/studio` mode w stylu Adobe Acrobat z:
- 3-column layout (Pages sidebar / PDF viewer / Tools panel) + drag-resize handles
- Menu bar (Plik / Widok / Narzędzia / Pomoc) z Radix DropdownMenu
- Pełen reorder + delete stron (DnD przez @dnd-kit/sortable + pdf-lib)
- Save/Save As/Export to DOCX/PPTX/XLSX/PNG/Print
- Recent documents (localStorage)
- Mouse wheel zoom, theme toggle, dynamic thumbnail aspect ratio
- Auth MVP: Supabase project (PDF Studio, eu-central-1), schema + RLS, LoginModal (signin/signup/forgot password)

Pozostałe ~6-8h pracy → cross-device sync recent + preferences, header avatar, email confirm handler, E2E test, deploy.

## Co zostało zrobione

### Studio Mode shell
- `src/app/[locale]/studio/page.tsx` (server) + `StudioPageClient.tsx` z dynamic SSR=false
- `StudioLayout.tsx` — 3-column flex grid + header + menubar + footer
- `StudioHeader.tsx` — Open files / Clear / Export / ThemeToggle / Classic mode link
- `StudioMenuBar.tsx` — 4 menus z Radix DropdownMenu, keyboard shortcuts (⌘O/S/⇧S/P/+/-/0)
- `StudioFooter.tsx` — file metadata
- `ViewerToolbar.tsx` — page nav + zoom (sticky bottom pod canvas)
- `PdfViewer.tsx` — pdfjs render z mouse wheel zoom (bez modyfikatora), proper cleanup
- `PagesPanel.tsx` — thumbnail per strona + DnD reorder + delete
- `StudioDropZone.tsx` — drag&drop zone gdy brak plików
- `LoginModal.tsx` — auth UI (signin/signup/forgot)

### Stack dodany
- `zustand 5.0` — store `studioStore.ts`
- `@radix-ui/react-dropdown-menu 2.1` — menu bar + submenus
- `@dnd-kit/core + sortable + utilities` — DnD reorder pages
- `@supabase/supabase-js 2.105` — auth + DB
- pdf-lib 1.17 (was) — page mutations (delete/reorder)
- pdfjs-dist 4.8 (was) — render PDF + thumbnails

### Helpery + hooks
- `src/lib/stores/studioStore.ts` — Zustand store: files, currentTool, currentPage, zoom, sidebars, recent
- `src/lib/hooks/useResizable.ts` — generic resizable panel hook (storage-backed)
- `src/lib/hooks/useRecentDocuments.ts` — localStorage recent (do migracji na Supabase)
- `src/lib/studio/file-actions.ts` — downloadBlob/printBlob/suggestSaveAsName
- `src/lib/supabase/client.ts` — singleton browser client
- `src/lib/contexts/AuthContext.tsx` — AuthProvider + useAuth hook

### Supabase project "PDF Studio"
- URL: `https://wvjoeyulugbpovhjboag.supabase.co`
- Region: eu-central-1 (Frankfurt) — RODO compliance
- PG 17.6.1
- Schema: `user_preferences`, `recent_documents`, `_keepalive` (3 tabele)
- RLS na każdej + auto-create user_preferences trigger on `auth.users` insert
- Credentials w `~/.claude/shared-credentials.env` (klucze `PDFCRAFT_STUDIO_*`)
- `.env.local` w repo (gitignored)

## Co zostało (kolejność wykonania)

### 1. Migracja `recent_documents` localStorage → Supabase (1.5h)
- Aktualizuj `useRecentDocuments` hook: jeśli zalogowany → INSERT/SELECT z tabeli `recent_documents` (Supabase), jeśli gość → localStorage fallback
- Sync logic: po signin merge localStorage do cloud (jeśli local ma items których nie ma w cloud)
- INSERT przy każdym `addRecent(file)` z `auth.uid()` w user_id
- SELECT z `ORDER BY last_opened_at DESC LIMIT 10`

### 2. Migracja `user_preferences` (theme, sidebars, locale) → Supabase (1.5h)
- Stwórz `usePreferences` hook (analogiczne do useRecentDocuments)
- Aktualizuje:
  - `theme` (z ThemeToggle)
  - `locale` (z i18n)
  - `left_sidebar_width` / `right_panel_width` (z useResizable)
  - `show_left_sidebar` / `show_right_panel` (z store)
- Debounce update (200-500ms) żeby nie spamować DB przy resize

### 3. Header avatar dropdown (1h)
- Po prawej w `StudioHeader` — gdy zalogowany pokazuj avatar + email
- Click → dropdown z opcjami: account info, settings (placeholder), sign out
- Inicjały z email albo Supabase user_metadata.avatar_url (jeśli będzie)

### 4. Email confirmation handler (1h)
- Supabase wysyła link `https://wvjoeyulugbpovhjboag.supabase.co/auth/v1/verify?type=signup&token=...&redirect_to=https://yourapp.com/pl/studio`
- Po kliku user wraca z `?access_token=...&refresh_token=...&type=signup` w URL hash/query
- Supabase client sam to obsłuży przez `detectSessionInUrl: true` (już ustawione)
- Pokaż success toast/banner po pomyślnej confirm — wymaga inspekcji URL params w StudioLayout

### 5. E2E test (1h)
- Signup → check email → click confirm link → redirect do studio
- Login → recent docs sync z poprzedniej sesji (jeśli były localStorage)
- Theme zmieniony na innym device → odśwież → sync
- Logout → recent zostaje w localStorage (graceful degrade)

### 6. Deploy Vercel + env vars (30 min)
- `vercel link` (jeśli nie linked) → wybierz projekt `access-manager-tools-pdfcraft`
- `vercel env add NEXT_PUBLIC_SUPABASE_URL production` (wartość z `.env.local`)
- `vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production`
- `git commit + push` → auto deploy preview branch
- Smoke test produkcji: signup → confirm → login na URL preview

## Kontekst decyzji w sesji

1. **Stirling-PDF deployed na Mac (OrbStack)** o 06:00 — daily driver Adobe Acrobat replacement dla Dariusza + rodzina (≤5 osób). Free tier wystarczy. Url localhost:8080.
2. **PDFCraft Studio = lead magnet + internal tool + klienci premium**, NIE płatny SaaS. AGPL OK dla tego modelu.
3. **Auth = lekki, bez cloud storage plików** — tylko psychologia "Twoje dane, Twoje konto" + cross-device sync recent + preferences. Pliki PDF nadal w przeglądarce (privacy USP zachowany).
4. **Nowy Supabase free tier** zamiast wspólnego z Access Manager — separation, łatwy billing, transferable.
5. **Email + hasło only w MVP**, OAuth/Magic Link później.

## Lessons learned (do dopisania w CLAUDE.md PDFCraft)

- [2026-05-07] KONTEKST: Cloudflare 1010 dla Python urllib user-agent przy `POST /v1/projects/.../database/query` Supabase Management API. Fix: użyj `curl` z `-H "User-Agent: ..."` zamiast Python urllib (default Python user-agent wygląda jak bot dla Cloudflare WAF). Zasada: dla Supabase Management API zawsze przez curl, nie urllib.
- [2026-05-07] KONTEKST: Infinite re-render loop w PdfViewer gdy useEffect deps zawierał `currentFile` (object derived przez Zustand selektor `selectCurrentFile`). Każda mutacja store → nowa identity obiektu → useEffect re-fire → load PDF → setPageCount → store update → loop. Fix: deps to **primitives** (`currentFileId`, `fileVersion`), pobieranie obiektu przez `useStudioStore.getState()` w callback. Reguła: nigdy nie używaj selectora obiektu z Zustand jako useEffect dep.
- [2026-05-07] KONTEKST: PDFCraft fork ma czystą separację `[tool]/page.tsx` (dispatcher) + 97 osobnych ToolComponents w `src/components/tools/<slug>/`. Logika PDF w `src/lib/pdf/processors/` jako pure functions. To umożliwiło rebuild UX (Acrobat-style Studio Mode) w 8-12h zamiast spodziewanych 33-67h. Reguła: ZAWSZE audyt architektury PRZED estymatą rebuild — separacja UI/logic determinuje czas.
- [2026-05-07] KONTEKST: Zustand selektor obiektu (`selectCurrentFile`) zwraca nową identity przy każdym re-render store, ale Zustand identity selektora jest stabilna gdy underlying data się nie zmieni (poprzez Object.is comparison). Trade-off: użycie primitive selektorów (`(s) => s.currentFileId`) jest szybsze i bezpieczniejsze dla useEffect deps. Reguła: dla useEffect deps preferuj primitive Zustand selectors.

## Branche

- `feat/studio-mode` — current work
- Commits: brak (jeszcze nie commit'owałem — czekam aż auth flow będzie gotowy do końca)
- Untracked: `.ai/`, nowe pliki w `src/components/studio/`, `src/lib/stores/`, `src/lib/hooks/`, `src/lib/contexts/`, `src/lib/supabase/`, `src/lib/studio/`
- `.env.local` (gitignored)

## Files added/modified

**Added (~15 files):**
- `src/app/[locale]/studio/page.tsx`, `StudioPageClient.tsx`
- `src/components/studio/{StudioLayout,StudioHeader,StudioMenuBar,StudioFooter,StudioDropZone,PdfViewer,PagesPanel,ToolsPanel,ViewerToolbar,LoginModal}.tsx`
- `src/lib/stores/studioStore.ts`
- `src/lib/hooks/{useResizable,useRecentDocuments}.ts`
- `src/lib/studio/file-actions.ts`
- `src/lib/supabase/client.ts`
- `src/lib/contexts/AuthContext.tsx`
- `messages/{pl,en}.json` (added namespace `studio`)
- `.env.local` (gitignored)

**Modified:**
- `package.json` (zustand, @radix-ui/react-dropdown-menu, @dnd-kit/*, @supabase/supabase-js)
- `package-lock.json`
- `.gitignore` (added `.env.local`)

## Type check status

Czysty na nowych plikach. 2 pre-existing errors w testach (`__tests__/properties/seo.property.test.ts`, `error-messages.property.test.ts`) NIE są moje.

## Dev server

Uruchomiony na `http://localhost:3001/pl/studio` (port 3000 zajęty), HMR działa przez Turbopack.
PID dev server: zobacz `lsof -ti:3001` przed restart.

## Reference

- Plan: `.ai/plans/2026-05-07-pdfcraft-studio-mode-rebuild.md`
- Qwen review: `.ai/reviews/2026-05-07-qwen-studio-rebuild-plan-review.md`
- Migracja Supabase: `/tmp/pdfcraft-migration.sql` (lokalnie, do dopisania jako `supabase/migrations/2026-05-07-initial.sql`)
- PM credentials: `~/.claude/shared-credentials.env` klucze `PDFCRAFT_STUDIO_*`
