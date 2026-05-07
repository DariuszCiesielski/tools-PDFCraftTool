# PDFCraft Studio Mode — Acrobat-inspired UX rebuild

**Data:** 2026-05-07
**Cel:** Acrobat/Stirling-inspired UX dla PDFCraft fork — lead magnet AIwBiznesie + internal tool + klienci premium (NIE płatny SaaS)
**Licencja kontekst:** PDFCraft = AGPL-3.0. Zaakceptowane bo model biznesowy nie wymaga zamknięcia kodu.
**Estymata:** 11.5-12.5h pracy aktywnej (z buforem 14-15h)

## Audyt istniejącej architektury (już wykonany)

PDFCraft fork ma **CZYSTĄ separację**:
- `src/app/[locale]/tools/[tool]/page.tsx` = dispatcher mapujący slug → komponent (448 linii, większość to importy)
- `src/components/tools/<slug>/` = 97 osobnych ToolComponents:
  - `'use client'` (browser-only WASM)
  - Pure UI + import processor z `@/lib/pdf/processors/<tool>`
  - Współdzielone: `FileUploader`, `ProgressBar`, `DownloadButton`
  - Hook `useBatchProcessing` dla multi-file
- `src/lib/pdf/processors/` = pure functions (compress, split, merge, ...)
- `src/lib/pdf/loader.ts`, `processor.ts`, `validation.ts` = clean layers
- `src/config/tool-content/{pl,en,...}.ts` = i18n metadata per locale
- `messages/{pl,en,...}.json` = i18n strings (1858 spolonizowanych w sesji 2)

**Wniosek:** ToolComponents są plug-and-play do innego layoutu. Nie wymagają przepisywania.

## Architektura docelowa

Nowa strona `/[locale]/studio` z layoutem 3-kolumnowym Acrobat-inspired, działająca **obok** istniejących `/tools/[tool]/` (zostają jako fallback dla deep linków SEO).

### Layout

- Header: open file, save, export, undo/redo, locale switcher, user
- Lewy sidebar (~280px): Pages thumbnails (PDF.js render miniatur), lista załadowanych plików, drag & drop
- Centrum (flex-1): PDF Viewer (PDF.js z `react-pdf` lub `EmbedPDF` MIT), z right-click context menu
- Prawy panel (~360px): kontekstowy dynamic ToolComponent (current tool), search + categories tools list
- Bottom bar: page navigation, zoom, file info

### Stack

- Next.js 15 (już w projekcie)
- React + TypeScript (już)
- Tailwind CSS + shadcn/ui (już)
- `@radix-ui/react-context-menu` przez shadcn (right-click)
- `react-pdf` (PDF.js wrapper) lub native PDF.js
- Zustand lub React Context (state: currentFile, currentTool, multipleFiles, undoStack)

## Plan etapowy

### Etap 1: MVP Studio (6h)

| # | Co | Czas | Pliki |
|---|---|---|---|
| 1.1 | `/[locale]/studio/page.tsx` server component | 30 min | nowy plik |
| 1.2 | `<StudioLayout />` 3-column flex grid + header + bottom bar | 2h | `src/components/studio/StudioLayout.tsx` |
| 1.3 | PDF Viewer (centrum) + thumbnails sidebar (lewy) | 1.5h | `src/components/studio/PdfViewer.tsx`, `PageThumbnails.tsx` |
| 1.4 | Tools panel z dynamic loading: search + 5 tools (Split, Merge, Compress, Edit Text, Watermark) | 1h | `src/components/studio/ToolsPanel.tsx` |
| 1.5 | Shared state przez React Context | 30 min | `src/lib/contexts/StudioContext.tsx` |
| 1.6 | Drag & drop multi-file | 30 min | extension PageThumbnails |

**Po Etapie 1:** działający shell z 5 najczęstszymi tools, gotowy do testowania i pokazywania klientom.

### Etap 2: Acrobat polish (4-5h)

| # | Co | Czas | Pliki |
|---|---|---|---|
| 2.1 | Right-click context menu (Shadcn `<ContextMenu />`) z 5-7 akcjami | 1h | `src/components/studio/ViewerContextMenu.tsx` |
| 2.2 | Header toolbar: open/save/export/undo/redo + basic undo stack | 1.5h | `src/components/studio/StudioHeader.tsx` |
| 2.3 | Bottom bar: page navigation + zoom + file info | 1h | `src/components/studio/StudioFooter.tsx` |
| 2.4 | Pozostałe 92 tools w prawym panelu (React.lazy dynamic load) | 1-1.5h | extension ToolsPanel |

### Etap 3: Brand + deploy (1.5h)

| # | Co | Czas |
|---|---|---|
| 3.1 | Logo AIwBiznesie + kolory CSS variables + nowe i18n keys (~10 dla layoutu) | 1h |
| 3.2 | Deploy na Vercel (subdomena `studio.aiwbiznesie.online` lub path `/studio` na obecnej) | 30 min |

## Ryzyka i niwelacja

1. **260 lint errors w upstream PDFCraft** — osobna sesja Workshop chore (BACKLOG P2 4-6h), nie blokuje Studio Mode
2. **3 niespójne definicje typu `Locale`** — naprawione przy okazji setup (~30 min, single source of truth z `@/lib/i18n/config`)
3. **Tools wymagające full viewport** (compare-pdfs, edit-pdf split-view) — otwierają się w **modal full-screen** zamiast prawym panelu (jak Adobe Acrobat dla "Edit Document" mode)
4. **Stan migracji między tools** — "In-progress" warning przed switch tool, zachowanie file w state Context

## Co dostajemy po wdrożeniu

1. Twój daily driver (alternatywa Adobe Acrobat dla codziennej pracy)
2. Lead magnet AIwBiznesie pod brand-controlled URL — Iwona w cold email
3. Internal tool dla zespołu + klientów premium
4. Privacy by design (WASM in-browser, pliki nie idą na serwer) — RODO argument dla B2B
5. 97 narzędzi (więcej niż Adobe Acrobat standard)

## Out of scope (do osobnego BACKLOG)

- Lint baseline 260 errors (P2, 4-6h)
- Locale type single source of truth (P3, 30 min — ale zrobimy przy okazji setup)
- Migracja na własną subdomenę dedykowaną (DNS + Cloudflare)
- White-label dla klientów premium (każdy ma swój brand) — to byłby Etap 4 po MVP
