# Handoff EOD — 2026-05-07 22:33 CEST → kontynuacja jutro

**Dla agenta z jutra (08.05 lub późniejsza data).** Sesja 2026-05-07 dłuższa niż zazwyczaj (4 zadania pełen dzień: Stirling-PDF deploy + PDFCraft Studio LIVE + Wave-2 + Wave-3 Phase A + UX pivot start). Dariusz wraca jutro.

## TL;DR — co zacząć od

1. Przeczytaj sekcję **"PIVOT UX (kluczowe!)"** poniżej — Dariusz w końcówce sesji zmienił podejście dla 13 narzędzi w drawer
2. Sprawdź `git log --oneline -5` w `~/projekty/Access Manager/tools-PDFCraftTool/`
3. Sprawdź deployed state na produkcji: `https://access-manager-tools-pdfcraft.vercel.app/pl/studio/`
4. Pierwsza akcja: zacznij od konkretnego narzędzia z **listy "Do zrobienia jutro"** poniżej

## Aktualny stan produkcji (2026-05-07 22:30 CEST)

### URL: `https://access-manager-tools-pdfcraft.vercel.app/pl/studio/`
- Deploy ID: `dpl_FuruE2WB3vohG4mbpKmPctv1WeHa`
- Direct URL: `access-manager-tools-pdfcraft-687f3dc2t.vercel.app`
- Alias ręcznie set (auto-promote nie działa 4× pod rząd — zawsze `vercel alias set` po deploy)

### Studio drawer + menubar: 56 narzędzi
- 7 oryginalnych (split, merge, rotate, page-numbers, watermark, compress, encrypt)
- 10 Wave-1 (OCR, PDF↔DOCX/XLSX/PPTX, sign, edit-metadata, extract-images, Word/Excel/Image-to-PDF)
- 10 Wave-2 (delete, organize, extract, crop, add-blank-page, n-up, flatten, header-footer, remove-annotations, remove-blank-pages)
- 29 Wave-3 Group A (PDF→PDF/utility — patrz `studioStore.ts` StudioToolId)

### Translations
- pl + en: 100% (wszystkie 56 narzędzi)
- 6 bonus: ar, de, es, id, ja, ko (Wave-3 zrobione przez Qwen3.6 lokalnie)
- 6 fallback do EN: fr, it, pt, vi, zh, zh-TW (świadomie pominięte — target Polska, multi-locale to bonus from upstream PDFCraft)

### Ostatnie 5 commitów main
```
b108599 fix(studio): split tool prefilled z current PDF (Acrobat pattern)
6739a94 fix(studio): redirect to login landing after sign-out
08a4f5c feat(studio): Wave-3 Phase A — 29 PDF→PDF utility tools w drawer + menubar
ed235b7 feat(studio): Wave-2 — 10 PDF page operations w Studio drawer
8ad6cb6 feat(studio): integrate 10 Wave-1 tools into Studio drawer
```

## PIVOT UX (kluczowe!)

**Dariusz zmienił podejście w końcówce sesji.** Wcześniej (Wave-1/2/3) ja klasyfikowałem narzędzia jako "self-uploader" (multi-input/iframe wizards/non-PDF input) i zostawiałem ich z własnym FileUploader w drawer — to było moje **uproszczenie programatorskie**, nie product UX.

**Dariusz powiedział wprost:** "to próba uproszczenia działania narzędzia, polegająca na przekierowaniu zadania do odrębnego modułu. **A tego właśnie nie chcę robić.** Chcę odwzorować Adobe Acrobat."

**Adobe Acrobat pattern dla narzędzi w right panel:**
- User otwiera plik → plik jest "aktywny obiekt"
- Każde narzędzie operuje na tym pliku **bez re-upload**
- Narzędzia które wymagają wielu plików (Combine Files) mają **osobny wizard/modal**, NIE są w right panel
- Konwertery non-PDF→PDF mają sens tylko gdy user nie ma jeszcze PDF (osobny entry point z homepage, nie panel narzędzia w Studio)

### Co to znaczy dla 13 narzędzi pozostałych

| Narzędzie | Typ | Decyzja Acrobat-style |
|---|---|---|
| ✅ split (1→N) | DONE 22:30 | Refactor commit `b108599`: prefilled current PDF, output ZIP |
| merge (N→1) | Multi-input | **Wymaga osobnego wizardu** "Combine Files" (poza drawer). Lub: pokazuje current jako pierwszy + UI "+ dodaj plik" |
| alternate-merge (2→1) | Multi-input | Jak merge — wizard lub current+add |
| grid-combine (N→1) | Multi-input | Jak merge |
| linearize | Single-input ALE klasyfikowany jako multi-file w skrypcie — sprawdź! Może być prefilled jak split | Sprawdź `useState<File[]>` vs `useState<File>` — jeśli single, refactor jak split |
| repair | Multi-file batch (`useState<File[]>`) | Acrobat: batch tool z osobnego wizardu lub current + add |
| edit-pdf | Iframe wizard | postMessage z current file do iframe — wymaga modyfikacji iframe receiver (skomplikowane, ~30-60 min) |
| stamps | Iframe wizard | Jak edit-pdf |
| deskew | Multi-file batch ZIP (`useBatchProcessing`) | Current jako [single-element batch] + UI "dodaj więcej" |
| font-to-outline | Multi-file batch ZIP | Jak deskew |
| word-to-pdf | Non-PDF input | Acrobat ma "Create from File" w File menu (NIE w right panel narzędzi). **Decyzja: usunąć z drawer? Lub trzymać z hint "Wybierz plik DOCX, nie PDF"** |
| excel-to-pdf | Non-PDF input | Jak word-to-pdf |
| image-to-pdf | Non-PDF input | Jak word-to-pdf |

## DO ZROBIENIA JUTRO (priority order)

### 🥇 P0 — Multi-input tools (5 narzędzi)
Akcja: dla każdego z [merge, alternate-merge, grid-combine, linearize, repair]:

**Najpierw zweryfikuj przez Playwright/claude-in-chrome empirycznie:**
1. Otwórz `https://access-manager-tools-pdfcraft.vercel.app/pl/studio/`, zaloguj się, załaduj PDF
2. Kliknij narzędzie z drawer
3. Sprawdź co user widzi

**Potem zaproponuj Dariuszowi UX zanim refactorujesz:**
- Opcja A: Acrobat-style "Combine Files" wizard — user klika narzędzie → modal ekranuje studio → user dodaje pliki → wykonuje → modal zamyka się + result w viewer
- Opcja B: W drawer prefilled `[currentFile.pdf]` jako pierwszy w liście + przycisk "+ Dodaj kolejny plik". Lista plików rośnie inline w drawer
- Opcja C (kompromis): drawer pokazuje "Aktualny plik: foo.pdf — to narzędzie potrzebuje DODATKOWYCH plików, kliknij aby otworzyć Combine Wizard" + przycisk → modal

**Rekomendacja:** opcja B (drawer + add) dla merge/alternate-merge/grid-combine/repair (zachowuje user w studio context). Opcja A (osobny wizard) dla linearize jeśli to single-file (sprawdź!).

### 🥈 P1 — Multi-file batch ZIP (2 narzędzia: deskew, font-to-outline)
Wzorzec analogiczny do merge: prefilled `[currentFile]` jako pierwszy element batch + UI "+ dodaj więcej".

### 🥈 P1 — Iframe wizards (2 narzędzia: edit-pdf, stamps)
**Skomplikowane.** Iframe receiver to zewnętrzna lib (np. PDFjs-edit, stamp annotation tool). Trzeba:
1. Sprawdzić czy iframe ma postMessage receiver dla loadFile
2. Jeśli tak — `iframeRef.current?.contentWindow?.postMessage({ type: 'loadFile', file: initialFile }, '*')`
3. Jeśli nie — modyfikacja iframe lib (osobny task, prawdopodobnie >2h)

**Pragmatyzm:** jeśli iframe modyfikacja jest >2h — zaproponuj Dariuszowi: "Zostaw self-uploader DLA TYCH 2 narzędzi, oznacz wizualnie w drawer, że wymagają osobnego pliku" (info banner w drawer "To narzędzie używa zewnętrznego edytora — wgraj plik w panelu").

### 🥉 P2 — Non-PDF→PDF (3 narzędzia: word/excel/image-to-pdf)
**Decyzja strategiczna wymagana** — przedyskutuj z Dariuszem:
- Czy te narzędzia mają sens w drawer (obecny PDF → konwertery które wymagają DOCX/XLSX/JPG)?
- Acrobat ma "Create PDF from File" w File menu, NIE w narzędziach right panel
- Rekomendacja: usunąć z drawer + StudioToolId, dostępne tylko via deep-link `/[locale]/tools/word-to-pdf/`

### 🏗️ P3 — Group B (8 narzędzi PDF→non-PDF)
Z handoffu Wave-3: extract-attachments, extract-tables, pdf-to-image, pdf-to-json, pdf-to-markdown, pdf-to-pdfa, pdf-to-svg, pdf-to-zip.

Pattern: refactor `initialFile?`/`hideUploader?` (BEZ onComplete — output non-PDF). Use `refactor-group-a-std.py` jako template, modify aby NIE dodawał `onComplete`.

### 🏗️ P3 — Group C (13 narzędzi non-PDF→PDF)
cbz/djvu/email/epub/fb2/json/markdown/mobi/pptx/psd/rtf/text/xps-to-pdf.

**Decyzja per Dariusz Acrobat pattern:** prawdopodobnie DO USUNIĘCIA z drawer (jak word/excel/image-to-pdf). Tylko deep-link routes. Nieiniejszuj refactoru bez decyzji.

## Co NIE robić (lessons learned z dzisiaj)

1. **NIE klasyfikuj jako "self-uploader" bez zgody Dariusza.** Programmer-thinking ("input ≠ current PDF więc inny path") ≠ product-thinking ("user ma jeden aktywny plik, każde narzędzie operuje na nim"). Zawsze dyskutuj UX **PRZED** refactorem.

2. **NIE używaj batch refactor script bez sample test PIERWSZEGO pliku.** Wave-3 lekcja: skrypt regex zrobił double-wrap na 9 plikach (`{!file && ({!file && !hideUploader && (<FileUploader />)})}`) — invalid JSX. Zawsze:
   - Test scriptu na 1 pliku
   - Audyt diff
   - Dopiero wtedy batch

3. **NIE polegaj na `vercel alias` auto-promote.** 4× pod rząd nie zadziałało. Zawsze po `vercel --prod --yes`:
   ```bash
   vercel alias set <new-direct-url>.vercel.app access-manager-tools-pdfcraft.vercel.app
   ```

4. **NIE forsuj pełnego scope w jednej sesji.** Wave-3 było 50 narzędzi zaplanowanych — zrobiło się 29. Group B+C czekają. Sesja >4h = jakość spada, decyzje strategiczne się przesypiają.

5. **NIE rób translation Qwen dla wielu lokalizacji bez retry logic.** Failure rate ~25-30% dla CJK/Arabic/RTL/long-output JSON. Zawsze max_retries=3 + idempotent skip.

## Kluczowe pliki/lokacje

```
~/projekty/Access Manager/tools-PDFCraftTool/
├── CLAUDE.md                      # 12 lekcji learned, project context
├── src/
│   ├── lib/stores/studioStore.ts  # StudioToolId type (56 wartości)
│   ├── components/studio/
│   │   ├── ToolDrawer.tsx          # SUPPORTED_TOOL_IDS + PDF_OUTPUT_TOOLS + renderTool switch
│   │   ├── ToolsPanel.tsx          # STUDIO_TOOLS array + ikony lucide-react
│   │   └── StudioMenuBar.tsx       # TOOL_GROUPS dropdown menu
│   └── components/tools/<slug>/<XxxTool>.tsx  # 88 ToolComponents
├── messages/{pl,en,...}.json      # 14 lokalizacji
├── scripts/
│   ├── refactor-group-a-std.py    # Wzorzec batch refactor (regex z optional comment)
│   ├── refactor-group-a-special.py
│   ├── translate-wave1-via-qwen.py # 3-retry logic + idempotent skip
│   ├── translate-wave2-via-qwen.py
│   └── translate-wave3-via-qwen.py # 2-batch split
└── .ai/handoffs/                   # 5 handoffów z dzisiaj (rano → wieczór)
```

## Komendy do wznowienia

```bash
# Sprawdź ostatnie commity
cd ~/projekty/Access\ Manager/tools-PDFCraftTool
git log --oneline -10

# Sprawdź production state
vercel inspect access-manager-tools-pdfcraft.vercel.app | grep -E "(id|created|target)"
# Powinno pokazać dpl_FuruE2WB3vohG4mbpKmPctv1WeHa

# Pre-flight: build powinien być clean
npx tsc --noEmit | grep "src/components" | head -5
# Oczekiwane: 0 errors w studio/tools

# Otwórz produkcję w przeglądarce + zaloguj się + załaduj testowy PDF
open https://access-manager-tools-pdfcraft.vercel.app/pl/studio/

# Konkretne narzędzia do testowania (kliknij każde z drawer):
# - merge → P0, sprawdź co Dariusz widzi
# - linearize → sprawdź czy single-file czy multi
# - edit-pdf → sprawdź iframe behavior
# - word-to-pdf → sprawdź non-PDF flow
```

## Lokalne credentialsy + projekty

- Supabase project "PDF Studio" (`wvjoeyulugbpovhjboag`, eu-central-1 Frankfurt) — schema: user_preferences, recent_documents, _keepalive
- Anon key i service role w `~/.claude/shared-credentials.env`
- Vercel team: `dariuszs-projects-f66532ce`
- Project name: `access-manager-tools-pdfcraft`

## Czas i zmęczenie

Sesja **5h kalendarzowo** (17:36 → 22:33 z przerwami) po pełnym dniu pracy (Stirling-PDF rano, Sesja 1 PDFCraft Studio production live, cross-device sync deploy). Dariusz wieczorem zmienił scope na pełen Wave-3 i zauważył 2 buguy. Zmęczony — agent jutro **NIE** powinien forsować scope. Pierwsze 30 min — wnikliwy verify obecnego stanu + dyskusja UX z Dariuszem **PRZED** kodowaniem.

## Trigger phrases dla Dariusza jutro

- "wznów" / "kontynuuj" → przeczytaj ten handoff jako pierwszą rzecz
- "co zostało" → pokaż listy P0/P1/P2/P3 z tego dokumentu
- "pokaż buga" → otwórz Playwright na produkcji
- "Acrobat-style" → wzorzec opisany w sekcji "PIVOT UX"
