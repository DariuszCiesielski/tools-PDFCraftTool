# Qwen3.6 review planu PDFCraft Studio Mode

**Data:** 2026-05-07 ~06:30 CEST
**Model:** qwen3.6:35b-a3b (lokalnie, M4 Max, 54s)
**Werdykt:** GO_WITH_CHANGES

## Top-line feedback

Plan logiczny i wykorzystuje istniejącą bazę kodu, ale **estymata 11.5-12.5h jest skrajnie optymistyczna** (Qwen sugeruje +30-40%, realna 15-16h). Drag & drop 30 min = pułapka (realnie 1.5-2h), migracja 92 tools do React.lazy 1h = zaniżone (realnie 2-3h).

## 5 konkretnych zmian do wdrożenia

1. **Zustand zamiast React Context** dla state management — uniknie niepotrzebnych re-renderów całego drzewa przy każdej zmianie strony PDF
2. **Ograniczenie scope tools w prawym panelu MVP** — tylko **batchowe/konfiguracyjne** (Split, Merge, Compress, Watermark, Encrypt, Rotate). Wizualne tools (Edit Text, Compare PDFs, Sign, Form Filler, OCR) → otwierane w **modalu fullscreen** zamiast wąskiego prawego panelu
3. **Realistyczna estymata: 15-16h** (z buforami i a11y)
4. **Undo/redo MVP: prosty 5-step stack tylko dla ostatnich operacji** w jednym pliku — nie pełna serializacja stanu wszystkich 97 narzędzi
5. **Feature flag isolation `/studio` od `/tools/[tool]/`** — żeby Studio nie zepsuło istniejącego UX dla deep linków

## Punkty pominięte w pierwotnym planie

- **Accessibility (a11y):** focus management, keyboard navigation, aria-labels — +1-2h
- **Mobile responsiveness:** 3-column nie działa na mobile, drawer pattern lub explicit "desktop only" — decyzja przed startem
- **State persistence:** refresh = utrata plików (state w pamięci). Decyzja: sessionStorage minimum lub komunikat "your files are local"
- **Error boundaries:** react-pdf może crashować — fallback UI

## Tools wymagające modal/fullscreen (NIE prawy panel)

- Edit Text / Visual Editor (canvas inline edit)
- Compare PDFs (split view)
- Form Filler / Sign (precyzyjne klikanie w dokument)
- OCR (long processing, status w tle)

## Akceptacja zmian

Plan zaktualizowany w `.ai/plans/2026-05-07-pdfcraft-studio-mode-rebuild.md` po decyzji Dariusza co do scope (MVP 8-10h vs full 15-17h).
