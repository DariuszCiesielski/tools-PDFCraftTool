# PDFCraft fork (tools-PDFCraftTool) — CLAUDE.md

## O projekcie

Fork upstream `chuanqisun/PDFCraft` (AGPL-3.0) zaadaptowany jako **AIwBiznesie PDF Studio** — privacy-first PDF toolkit działający w 100% w przeglądarce (WASM, pdfjs-dist, pdf-lib, Pyodide dla DOCX/PPTX).

**Strategia produktu** (decyzja 06.05 + 07.05):
- **Lead magnet** dla AIwBiznesie (no-friction, brand-controlled URL)
- **Internal tool** dla Dariusza + zespołu
- **Klienci premium** — opcjonalnie udostępniany jako gratis dla VIP
- **NIE płatny SaaS** — AGPL viral OK dla tego modelu

## Tech stack

- Next.js 15 + Turbopack, App Router, **`output: 'export'`** (static SSG, brak server runtime)
- React 19 + TypeScript
- Tailwind CSS + custom UI components (NIE shadcn)
- next-intl (14 języków, primary: pl, fallback: en)
- pdfjs-dist 4.8 + pdf-lib 1.17 + Pyodide (dla DOCX/PPTX export)
- Zustand 5 (`studioStore`)
- @radix-ui/react-dropdown-menu (menu bar, context menus)
- @dnd-kit/{core,sortable,utilities} (page reorder)
- @supabase/supabase-js 2.105 (auth + DB)

## Architektura

### Tools-first vs Studio mode
**Dwa równoległe tryby:**
- `/[locale]/tools/[tool]/` — klasyczny tool-first dispatcher (97 narzędzi, każde własna strona, SEO-friendly deep linki)
- `/[locale]/studio` — Acrobat-inspired 3-column layout (PagesPanel + PdfViewer + ToolsPanel) — **rebuild UX nad tymi samymi 97 ToolComponents**

Tools logic w `src/lib/pdf/processors/<tool>.ts` jako pure functions, UI w `src/components/tools/<slug>/<XxxTool>.tsx`. **CZYSTA separacja** umożliwiła rebuild UX (Studio) w 8-12h zamiast spodziewanych 33-67h.

### Auth (Supabase)
- Project **PDF Studio** (`wvjoeyulugbpovhjboag`) w eu-central-1 Frankfurt
- Browser-only client (`src/lib/supabase/client.ts`) — NIE używamy @supabase/ssr (output:export)
- AuthContext + useAuth hook
- Schema: `user_preferences`, `recent_documents`, `_keepalive` (3 tabele) + RLS na każdej + auto-create user_preferences trigger on `auth.users` insert
- Site URL config: production + preview wildcards + localhost (PATCH przez Management API)

### Studio Mode komponenty
- `StudioLayout` — root flex container
- `StudioHeader` — open/clear/export/theme/avatar (TODO P0)
- `StudioMenuBar` — Plik/Widok/Narzędzia/Pomoc + skróty
- `StudioFooter` — file metadata
- `PagesPanel` — thumbnail per strona + DnD reorder + delete
- `PdfViewer` + `ViewerToolbar` — pdfjs render + page nav + zoom
- `ToolsPanel` — search + 7 batchowych tools w prawym panelu
- `LoginModal` — signin/signup/forgot-password z eye toggle

### State management
- `useStudioStore` (Zustand) — files, currentTool, currentPage, zoom, sidebar widths, recent
- File state: `data: Uint8Array | null` (lazy populated po pierwszym load) + `version: number` (inkrementowany przy mutation, trigger re-render w PdfViewer/PagesPanel)

## Konwencje

### TypeScript
- Strict mode, brak `any`
- Typy z lucide-react: `LucideIcon` (NIE `React.ComponentType`)
- Zustand selectors: **primitives** (id, version) w useEffect deps, NIE objects
- Blob types: `data as BlobPart` cast (TS lib DOM strict)

### Style
- HSL CSS variables (`--color-primary`, `--color-card`, `--color-border`)
- `bg-[hsl(var(--color-card))]` pattern (NIE shadcn semantic classes)
- Theme: `<html class="dark">` toggle + localStorage

### i18n
- Top-level namespace `studio` w `messages/{pl,en,...}.json`
- `useTranslations('studio')` w komponentach
- Fallback do `en` gdy klucz nie istnieje w innych locale

### Commits
- Conventional commits: `feat(studio):`, `fix:`, `chore(vercel):`
- HEREDOC z `Co-Authored-By: Claude Opus 4.7 (1M context)` ostatnia linia
- `git add <konkretne_pliki>` — NIE `-A` (lekcja PM 2026-04-27)

## Lessons Learned

- [2026-05-07] KONTEKST: Cloudflare 1010 dla Python urllib user-agent przy `POST /v1/projects/.../database/query` Supabase Management API. Fix: użyj `curl` z `-H "User-Agent: ..."` zamiast Python urllib. Reguła: dla Supabase Management API zawsze przez curl, nie urllib. Plus payload przez `-d @plik.json` żeby uniknąć escaping issues w shell.
- [2026-05-07] KONTEKST: Infinite re-render loop w PdfViewer gdy useEffect deps zawierał `currentFile` (object derived przez Zustand selektor). Każda mutacja store → nowa identity obiektu → useEffect re-fire → load → setPageCount → store update → loop. Fix: deps to **primitives** (`currentFileId`, `fileVersion`), pobieranie obiektu przez `useStudioStore.getState()` w callback. Reguła: nigdy nie używaj selektora obiektu z Zustand jako useEffect dep.
- [2026-05-07] KONTEKST: PDFCraft fork ma czystą separację `[tool]/page.tsx` (dispatcher) + 97 osobnych ToolComponents w `src/components/tools/<slug>/`. Logika PDF w `src/lib/pdf/processors/` jako pure functions. Audyt architektury PRZED estymatą umożliwił rebuild UX (Acrobat-style Studio) w 8-12h zamiast spodziewanych 33-67h. Reguła: ZAWSZE audyt architektury (separacja UI/logic) przed estymatą rebuildu.
- [2026-05-07] KONTEKST: Modal focus regression — `useEffect` deps `[isOpen, handleKeyDown]` powodowało re-fire przy każdym keystroke (handleKeyDown re-tworzony bo deps zawierało `onClose` które było inline funkcją w parent). Skutek: `focusableElements[0].focus()` przewracał focus na X close button po wpisaniu każdej litery. Fix: useRef pattern dla handler, useEffect deps `[isOpen]` only. Reguła: dla event listeners w useEffect używaj useRef żeby uniknąć re-fire przy zmianach handler.
- [2026-05-07] KONTEKST: Vercel default alias `<project-name>.vercel.app` może być **custom alias** ręcznie podpięty kiedyś — auto-promote do nowego production deploy NIE DZIAŁA. Symptom: nowy deploy Ready, alias wskazuje stary deploy. Diagnoza przez `vercel inspect <alias-url>` (pokazuje który deployment alias wskazuje). Fix: `vercel alias set <new-direct-url> <alias-domain>`. Reguła: po każdym production deploy sprawdzaj smoke test alias URL, nie tylko direct deploy URL — alias może wskazywać stary build.
- [2026-05-07] KONTEKST: Vercel CLI `env add NAME preview` w nowej wersji wymaga argumentu `[git-branch]` (positional) — bez tego pojawia się `branch_not_found undefined`. Fix: `vercel env add NAME preview "feat/branch-name" --value "..." --yes`. Plus dla preview env vars trzeba dodawać per branch (nie ma wildcard "all preview"). Reguła: dla preview env vars używaj explicit branch name w trzecim arg pozycyjnym.
- [2026-05-07] KONTEKST: Pyodide+WASM dla pdf-to-docx/pptx/xlsx — pierwsze użycie 30-60s download (waga ~10-20 MB Python interpreter), po pierwszym cached. UX: `setProcessing(true)` + spinner w menubar + tooltip "Pierwsza konwersja może potrwać dłużej". Reguła: każda async operacja >10s wymaga progress indicatora.
- [2026-05-07] KONTEKST: Handoff zawierający Supabase project URL (`wvjoeyulugbpovhjboag.supabase.co`) jest BEZPIECZNY — to public info (NEXT_PUBLIC_SUPABASE_URL trafia do bundle Vercel po deploy). Anon key też jest "public by design" — RLS policies chronią dane (`auth.uid() = user_id`). Standardowy pattern Supabase. Reguła: w skanach security odróżniaj NEXT_PUBLIC_* (OK) od SERVICE_ROLE/PAT/DB_PASSWORD (NIGDY w repo).
- [2026-05-07] KONTEKST: ThemeToggle używany w headerze BOTH Studio (z AuthProvider) i klasycznych stronach `/tools/[tool]/` (BEZ AuthProvider — output:export prerenderuje 1589 stron). Dodanie `useAuth()` w ThemeToggle wywaliło prerender 100% klasycznych narzędzi: `Error: useAuth must be used within AuthProvider`. Fix: nowy hook `useAuthOptional()` zwracający `null` zamiast throw, używany przez `usePreferences` i `useRecentDocuments`. Reguła: dla komponentów dzielonych między różne layouty (auth vs non-auth) używaj **safe optional context pattern** — `useContext()` bez throw. Sprawdź `grep -rn "AuthProvider" src/` PRZED dodaniem useAuth do dzielonego komponentu.
- [2026-05-07] KONTEKST: Hook-as-syncer pattern dla cross-device sync: zamiast przepisywać 3 moduły (ThemeToggle/useResizable/studioStore) na cloud-aware, jeden hook `usePreferences()` bridge'uje cloud ↔ istniejące mechanizmy (localStorage keys + Zustand state). Mount w 1 miejscu (StudioLayout), zero zmian w `useResizable.ts` i `studioStore.ts`. Side effect: niewielki latency między user toggle sidebar i cloud upsert (debounce 400ms). Reguła: gdy migrujesz local-only state do cloud, **nie przepisuj source of truth — bridge'uj**. Mniejsze ryzyko regresji, łatwiejszy rollback (usuń 1 hook, działa jak było).
- [2026-05-07] KONTEKST: PDF_OUTPUT_TOOLS routing w ToolDrawer — `studioStore.replaceFileData` zawsze tworzy `new File([blob], name, { type: 'application/pdf' })`. Wywołanie go z DOCX/XLSX/PPTX/ZIP blob'em wstawia do viewera "PDF" który nie da się sparse'ować (wybuch w PdfViewer). Fix: `PDF_OUTPUT_TOOLS` set w ToolDrawer — `handleComplete` jest podawany TYLKO narzędziom produkującym PDF (compress/rotate/page-numbers/watermark/encrypt/sign/edit-metadata/ocr). Pozostałe (pdf-to-docx/excel/pptx, extract-images, word/excel/image-to-pdf) używają wbudowanego DownloadButton. Reguła: gdy refactorujesz multi-tool drawer, sprawdź MIME compatibility output↔store przed routingiem callback'u.
- [2026-05-07] KONTEKST: Niejednolitość ToolComponents zwiększyła czas refactoru z 5min/sztuka do 15-30min/sztuka. Wave-1 (10 narzędzi): 4 miały jednolity pattern `file: UploadedFile | null` + `result: Blob | null` (refactor ~5 min/sztuka), 3 wymagały indywidualnej analizy (`edit-metadata` z `file: File` + `resultBlob` + `resultFilename`, `extract-images` z `files: UploadedFile[]`, `sign` z custom signState + iframe), 3 zostały self-uploader (input ≠ PDF). Total Wave-1 = ~70 min tools refactor + 30 min drawer/panel/translations = ~100 min (mieści się w estymacie 2-3h). Reguła: estymata "X × 10 narzędzi" działa tylko gdy WSZYSTKIE 10 mają identyczny pattern. Sprawdź `grep -E "useState.*File|useState.*Blob" 10×tools | head -5` przed estymatą.
- [2026-05-07] KONTEKST: Wave-2 refactor — skrypt `refactor-wave2.py` użył regex `(?:/\*\*[\s\S]*?\*/\s*)?className\?:\s*string;\s*}` ale FAILował na 4 z 9 narzędzi bo `}` w pliku to multi-line `\n}` bez whitespace między. Sztywny regex pattern dla niejednolitych plików = porażka — 5 narzędzi zostało do manual edit (~30 min). Reguła: dla skryptów refactoru regex pattern testuj na 1-2 plikach PRZED full batch run. Jeśli regex zawodzi na >50% — manual edit jest szybszy niż debugowanie regex.
- [2026-05-07] KONTEKST: Wave-2 wymaga 4 wire-up fazy a nie tylko refactor: (1) refactor ToolComponent z propsami, (2) extend StudioToolId type w studioStore.ts, (3) ToolDrawer — imports + SUPPORTED_TOOL_IDS + PDF_OUTPUT_TOOLS + RESULT_FILENAME_PREFIX + renderTool switch case, (4) ToolsPanel STUDIO_TOOLS array + ikony lucide-react. Pominięcie fazy 4 oznacza że narzędzie istnieje w drawer routing ale nie pojawia się w UI lewego panelu. Reguła: dla "dodać narzędzie do Studio" zawsze 4 fazy — refactor + type + drawer + panel. Jedna w bok = niewidoczne dla usera.
- [2026-05-07] KONTEKST: Crop ma nested `state.file` w `useState<CropState>({...})` zamiast osobnego `useState<File | null>`. Refactor wymagał init `state` z `file: initialFile ?? null` ZAMIAST `setFile(initialFile)`, plus useEffect który wywołuje `handleFilesSelected([initialFile])` (bo trzeba załadować PDF + wyrenderować pierwszą stronę przez `renderPage`). onComplete callback wymaga `state.file` zamiast lokalnego `file`. Reguła: nested state z `file` w obiekcie wymaga delegacji ładowania PDF do `handleFilesSelected` przez useEffect mount, nie prostego `setFile`.
- [2026-05-07] KONTEKST: Wave-1+Wave-2 dodały narzędzia do drawer + ToolsPanel ale NIE do StudioMenuBar TOOL_GROUPS — cicha regresja UX (menu = "co aplikacja umie", user nie widzi nowych funkcji). Wykryte dopiero w Wave-3 przez Dariusza. Reguła: dla każdego nowego narzędzia w drawer wymagana 5-fazowa integracja: (1) StudioToolId type, (2) ToolDrawer (imports + SUPPORTED + PDF_OUTPUT + RESULT_FILENAME + renderTool), (3) ToolsPanel STUDIO_TOOLS array z ikonami, (4) StudioMenuBar TOOL_GROUPS array, (5) translations. Sprawdź `grep TOOL_GROUPS StudioMenuBar.tsx` PRZED commit każdego nowego narzędzia.
- [2026-05-07] KONTEKST: Refactor batch script regex robi DOUBLE-WRAP gdy oryginalny plik już ma `{!file && (...)}` wokół FileUploader. Idempotent check `if 'initialFile?:' in text` chroni przed re-refactor (props), ale NIE przed wrap. Skutek: 9 plików Wave-3 miało invalid JSX `{!file && ({!file && !hideUploader && (<FileUploader />)})}`. Reguła: PRZED odpalaniem refactor batch — (a) sprawdź `grep '!file' tool.tsx` w 1-2 sample files, (b) script powinien sprawdzać czy `!hideUploader` jest w pliku PRZED dodawaniem wrap.
- [2026-05-07] KONTEKST: Multi-file batch tools (deskew, font-to-outline) NIE mają `useState<File | null>` — używają `useBatchProcessing` hook z `files` array. Plus iframe wizards (edit-pdf, stamps) i multi-input tools (alternate-merge, grid-combine, linearize, repair) → keep self-uploader, NIE forsuj prefilled pattern. Drawer wire-up bez propsów: `case 'tool-name': return <XxxTool />`. Audyt shape PRZED refactor: `grep -E "useState<File|useBatch|files\[\]" tools/*Tool.tsx`.
- [2026-05-07] KONTEKST: UploadedFile shape (z `src/types/pdf.ts`) wymaga `{ id: string, file: File, status: 'pending'|... }` — NIE `{ name, size }`. Niektóre narzędzia (pdf-to-greyscale) używają tej struktury. Refactor: `setFile({ file: initialFile, id: crypto.randomUUID(), status: 'pending' })`. Plus onComplete użyje `file?.file` (nullable chain) zamiast lokalnego `file`.

## Skróty klawiszowe Studio Mode

- **⌘O / Ctrl+O** — Otwórz pliki
- **⌘S / Ctrl+S** — Zapisz (PDF z mutacjami)
- **⇧⌘S / Shift+Ctrl+S** — Zapisz jako (prompt nazwy)
- **⌘P / Ctrl+P** — Drukuj
- **⌘+ / Ctrl++** — Powiększ
- **⌘− / Ctrl+−** — Pomniejsz
- **⌘0 / Ctrl+0** — Reset zoom 100%
- **Mouse wheel** — zoom (bez modyfikatora)
- **Drag&drop** — multi-file upload

## Production URL

`https://access-manager-tools-pdfcraft.vercel.app/pl/studio`

## Otwarte zadania (na sesję 2)

Patrz: `.ai/handoffs/handoff-2026-05-07-0948-studio-prod-live-confirmation-flow-pending.md`

P0:
1. Header avatar dropdown w prawym górnym rogu (1h)
2. Confirmation flow UX banner (45 min)

P1:
3. Migracja recent_documents localStorage → Supabase (1.5h)
4. Migracja user_preferences → Supabase (1.5h)

P2-P3:
5. E2E test full flow
6. Email template polonizacja
