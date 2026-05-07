# Handoff — 2026-05-07 ~22:00 CEST — Wave-3 Group A done, Group B+C pending

## Stan końcowy tej sesji

**Wave-3 Phase A (Group A — 29 PDF→PDF/utility narzędzi) + Phase 0 (MenuBar fix) DONE.** Studio drawer + menu rozszerzony z 27 do **56 narzędzi** (88 ÷ 56 = ~64% upstream parity). Build PASS. Translations 14 lokalizacji × 29 nowych narzędzi (mix ręcznych pl/en + Qwen3.6 lokalnie 12 lokalizacji).

## Co zostało zrobione

### Phase 0: MenuBar fix (krytyczna luka Wave-1+Wave-2)
- `StudioMenuBar.tsx` TOOL_GROUPS — dodane 27 obecnych narzędzi (Wave-1 + Wave-2) do dropdown menu "Narzędzia". Wcześniej tylko 7 oryginalnych było w menu (regresja UX wykryta przez Dariusza)
- Dodana piąta kategoria 'convert' w MenuBar (była tylko w drawer)

### Phase A: Group A — 29 narzędzi PDF→PDF/utility

**Refactor ToolComponent (21 narzędzi):**
- 16 std (pełen `initialFile`/`hideUploader`/`onComplete` + useEffect + setResult callback): background-color, bookmark, combine-single-page, decrypt, divide, fix-page-size, invert-colors, page-dimensions, posterize, remove-metadata, remove-restrictions, reverse, rotate-custom, sanitize, table-of-contents, text-color
- 3 special (z onComplete + custom shape): find-and-redact, pdf-to-greyscale (UploadedFile shape), pdf-booklet (setResultBlob)
- 2 special bez onComplete (output non-PDF lub ambig): rasterize, ocg-manager

**Self-uploader wire-up only (8 narzędzi):**
- alternate-merge, grid-combine, linearize, repair (multi-input)
- edit-pdf, stamps (iframe wizards)
- deskew, font-to-outline (multi-file batch z ZIP output)

**Wire-up (4 fazy):**
1. `studioStore.ts` — StudioToolId rozszerzony o 29 wartości
2. `ToolDrawer.tsx` — 29 dynamic imports + SUPPORTED_TOOL_IDS + PDF_OUTPUT_TOOLS (19 z onComplete) + RESULT_FILENAME_PREFIX + 29 cases w renderTool switch
3. `ToolsPanel.tsx` — 29 nowych ikon lucide-react + STUDIO_TOOLS entries (kategorie pages/enhance/compress/security)
4. `StudioMenuBar.tsx` — 29 entries w odpowiednich grupach

**Translations:**
- pl + en: ręcznie (Python in-place)
- 12 lokalizacji × 29 narzędzi × 3 keys = 1044 keys via Qwen3.6 lokalnie ($0)
- Qwen split na 2 batche × ~15 narzędzi (lekcja Wave-2: long output → JSON malformation, batch + retry x3)

**Skrypty zacommitowane:**
- `scripts/refactor-group-a-std.py` — 16 std tools batch refactor (regex z optional comment, idempotent skip)
- `scripts/refactor-group-a-special.py` — 5 special tools (różne setResult patterns, with/without onComplete, UploadedFile shape support)
- `scripts/translate-wave3-via-qwen.py` — Wave-3 translation z 2-batch split + 3-retry logic + idempotent skip

## Pending — Group B + C dla kolejnej sesji

### Group B: 8 narzędzi PDF→non-PDF (~1-1.5h)
Pattern: Wave-1 PDF→non-PDF (extract-images, pdf-to-docx) — refactor `initialFile`/`hideUploader` ALE BEZ `onComplete` (output to ZIP/PNG/JSON/SVG, replaceFileData oczekuje PDF MIME).

Lista:
- `extract-attachments` → ZIP
- `extract-tables` → CSV/XLSX
- `pdf-to-image` → PNG/JPG (single page lub all)
- `pdf-to-json` → JSON
- `pdf-to-markdown` → MD
- `pdf-to-pdfa` → PDF/A (technicznie PDF, ale fixed format)
- `pdf-to-svg` → SVG (vector)
- `pdf-to-zip` → ZIP archive

**Strategia:** użyć skryptu `refactor-group-a-std.py` (16 std pattern) jako szablonu — większość ma `useState<File | null>` shape. Modyfikacja: wyłączyć dodawanie onComplete propsa (z wyjątkiem pdf-to-pdfa który JEST PDF).

### Group C: 13 narzędzi non-PDF→PDF (~40-60 min)
Pattern: Wave-1 word-to-pdf/excel-to-pdf/image-to-pdf — keep self-uploader (input ≠ current PDF). NIE wymaga refactoru ToolComponent. Tylko wire-up:
1. StudioToolId — dodać 13 wartości
2. ToolDrawer — 13 dynamic imports + SUPPORTED_TOOL_IDS + 13 cases (`return <XxxTool />` bez propsów)
3. ToolsPanel — 13 entries (kategoria 'convert')
4. StudioMenuBar — 13 entries w 'convert' group

Lista:
- `cbz-to-pdf`, `djvu-to-pdf`, `email-to-pdf`, `epub-to-pdf`, `fb2-to-pdf`
- `json-to-pdf`, `markdown-to-pdf`, `mobi-to-pdf`, `pptx-to-pdf`, `psd-to-pdf`
- `rtf-to-pdf`, `text-to-pdf`, `xps-to-pdf`

### Group D — DECYZJA STRATEGICZNA wymagana

**11 narzędzi nie pasują do prostego drawer pattern:**
- `compare-pdfs` — wymaga 2 input PDFs (drawer ma 1)
- `form-creator` — multi-step wizard (drawer = single panel)
- `form-filler` — wymaga pre-existing forms
- `digital-sign` — PKI cert workflow multi-step
- `pdf-multi-tool` — meta-tool combining multiple operations
- `pdf-reader` — viewer (już mamy PdfViewer w Studio, redundant)
- `validate-signature` — read-only display
- `view-metadata` — read-only display
- `add-attachments` — embed files
- `change-permissions` — similar do encrypt + extra
- `edit-attachments` — modify existing

**Opcje dla kolejnej sesji:**
- A) Zostaw poza drawer/menu, dostępne tylko via deep-link `/[locale]/tools/[tool]/`
- B) Custom drawer behavior dla niektórych (np. compare-pdfs jako split view drawer)
- C) Część do drawer (read-only displays), część poza (multi-step wizards)

**Rekomendacja:** opcja A dla wszystkich 11 — zachowaj pure UX (drawer = single tool, single PDF). Multi-step wizards → osobne strony. Deep-link routes nadal SEO-friendly.

## Build verification

```
✓ Compiled successfully
TS check (npx tsc --noEmit) — 0 errors w src/components/tools/ + src/components/studio/
ESLint — istniejące 260 warnings z upstream (eslint.ignoreDuringBuilds: true)
```

## Pending tej sesji (przed final commit)

- Translations Wave-3 leci w tle (~15-40 min)
- Final build verify (po translations)
- Commit Wave-3 Phase A + Phase 0
- Deploy + alias set (lekcja: alias auto-promote NIE działa — `vercel alias set` ręcznie)
- Smoke test 56 narzędzi widocznych w drawer + menu

## Production URL

`https://access-manager-tools-pdfcraft.vercel.app/pl/studio/`

## Czas tej sesji (od restartu ~19:00)

- Wave-2 commit + deploy: ~20 min
- Audyt 88 narzędzi + klasyfikacja A/B/C/D: ~10 min
- Phase 0 MenuBar fix: ~5 min
- Phase A refactor (skrypty + manual fix 5 plików, double-wrap rollback, useEffect import fix, UploadedFile shape fix): ~60 min
- Phase A wire-up (StudioToolId + ToolDrawer + ToolsPanel + StudioMenuBar): ~20 min
- Translations seed pl+en + skrypt + run: ~15 min
- Handoff + commit + deploy: ~15 min (planowane)

**Razem ~145 min (2.5h) po restarcie sesji.** Total dnia: 4h Wave-2 + 2.5h Wave-3 Phase A.

## Lessons learned (do dodania do CLAUDE.md PDFCraft)

- [2026-05-07] Wave-1+Wave-2 dodały narzędzia do drawer ale **NIE do StudioMenuBar TOOL_GROUPS** — cicha regresja UX. Lekcja: dla każdego nowego narzędzia w drawer, sprawdź `grep TOOL_GROUPS src/components/studio/StudioMenuBar.tsx` PRZED commit. Wire-up to nie 4 fazy (state/drawer/panel/menubar), to 5 faz — ⁵ = StudioMenuBar TOOL_GROUPS.
- [2026-05-07] Refactor batch script regex robi double-wrap gdy oryginalny plik miał już `{!file && (...)}`. Zawsze sprawdź `grep '!file' file.tsx` PRZED odpalaniem skryptu. Idempotent check `if 'initialFile?:' in text` chroni przed re-refactor ale NIE przed double-wrap.
- [2026-05-07] Multi-file batch tools (deskew, font-to-outline) NIE mają `useState<File | null>` — używają `files` array z `useBatchProcessing` hook lub similar. Audyt shape przed refactor: `grep 'useState<File\|files\[\]' tools/*Tool.tsx`. Te narzędzia → keep self-uploader, NIE forsuj prefilled pattern.
- [2026-05-07] UploadedFile shape (z `src/types/pdf.ts`) wymaga `{ id, file, status: 'pending'... }` — nie `{ name, size }`. Refactor narzędzi z UploadedFile state musi opakować initialFile zgodnie ze schemą typu.
