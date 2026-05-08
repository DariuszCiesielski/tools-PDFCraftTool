## Recenzja: Plan refactor PDFCraft Studio do Acrobat-style MDI
Data: 2026-05-08 | Tryb: plan | Iteracja: 1/1

### Recenzenci
- **Codex (GPT, high reasoning):** ✅ STATUS=GO_WITH_CHANGES (~5 min)
- **Qwen3.6 lokalny:** ✅ STATUS=GO_WITH_CHANGES (~3 min)
- Gemini 3.1 Pro: ⏸ pominięty (brak powodu §5 — nie strategiczna nieodwracalna)

### Werdykt zbiorczy
**GO_WITH_CHANGES** — plan wymaga REWRITE do v3 przed implementacją. Oba modele zidentyfikowały **fundamentalne luki architektoniczne** które zniweczyłyby implementację gdyby zostały po cichu pominięte.

### Zgodność (oba modele potwierdzają — to są must-fix)

1. **`createJSONStorage` na `Uint8Array` = anty-pattern.** JSON.stringify zamienia binary na base64 (+33% rozmiar, GC pressure, timeout >5MB). Native `idb-keyval` z `structuredClone`, NIE JSON middleware.

2. **SSR hydration mismatch / race condition na mount.** Zustand `persist` hydrates async, App Router renderuje synchronicznie. Bez `skipHydration` + `hasHydrated` flag → flicker / null state / late overwrites. Codex dodatkowo wykrył **konflikt z istniejącym `usePreferences()`** (commit 760d134 wczoraj) który też mountuje sync z Supabase.

3. **Undo memory bloat.** `previousData: Uint8Array` na każdej operacji × 50 ops × 10MB = **500MB RAM**. Plan v2 (1h estymata) jest fundamentalnie zły. Rozwiązanie: replay-based (operations metadata + base blob, NIE snapshots) lub limit 20 snapshotów.

4. **Kolejność faz: F2 (persist) PRZED F1.5 (undo).** Undo bez persistence jest bezużyteczne po reload — Cmd+R kasuje historię. Faza 1.5 musi być po Fazie 2.

5. **Pominięto:** ARIA `role="tablist"`/`tab`/`tabpanel`, keyboard shortcuts (Ctrl+Tab/W/Z/S, Esc), `beforeunload` prompt na unsaved, mobile/touch UX (swipe between tabs, long-press menu, pinch zoom).

### Rozbieżności

| Temat | Qwen | Codex | Rekomendacja |
|---|---|---|---|
| Głębia architektury | Action-oriented (msgpack-lite, useSyncExternalStore) | Strukturalna (2 stores: Session + DocumentRepository) | **Codex idzie głębiej** — separacja `StudioSessionStore` (tabs, view, UI) vs `PdfDocumentRepository` (IDB blobs/snapshoty) jest realnie potrzebna, mój monolithic `studioStore` jest za szeroki |
| Estymaty | "6h realnej pracy" | 7-10.5h must-have, 10.5-15h full | **Codex realistyczniejszy** — Qwen może niedoceniać F2 quota/race work |
| Kolejność | F1 → F2 → F1.5 (możliwy merge F1.5 do F2) | F0 (new!) → F1 → F2 → F1.5 | **Codex** — dodaje Fazę 0 (separacja stores + per-tab viewState) **PRZED** TabBar |

### Unikalne spostrzeżenia

**Tylko Codex (głębsze):**
- **Per-tab `currentPage` + `zoomLevel` brakuje** — obecnie globalne, `selectFile()` resetuje page do 1. **Łamie Acrobat mental model** "wróć do dokumentu tam gdzie zostawiłem". Mój plan v2 tego NIE widział mimo deklaracji że "studioStore JEST gotowy pod MDI". **Realnie wymaga refactor PRZED TabBar.**
- **Quota strategy dla Safari/iOS/private mode** — 50 MB OK na desktop ale Safari iOS ma niższy limit, private mode zero persistence. Plan musi obsłużyć `navigator.storage.estimate()/persist()`, LRU cleanup, QuotaExceededError UX.
- **`replaceFileData()` jako "replace whole document"** — wiele narzędzi już operuje na całym buforze (compress/encrypt/watermark/etc), NIE per-page. Mój `PageOperation { type:'remove', pageIndex, removedData }` nie pokrywa tego case'a. Snapshot whole document per undo step, nie per operation.
- **Cloud sync metadata = opt-in.** Nazwy plików mogą być sensitive ("umowa-Adam-Wizimirski.pdf"). Plan v2 default ON — Codex sugeruje opt-in.
- **Recovery UX**: "Restore last session?" zamiast bezwarunkowego rehydrate. Zgodne z Acrobat (preference, default OFF).

**Tylko Qwen (action items):**
- ARIA dokładne role names: `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `role="tabpanel"`
- Mobile: swipe between tabs, long-press context menu (close, rename), pinch-to-zoom
- `idb` directly z `structuredClone` LUB `msgpack-lite` — konkretne biblioteki

### Decyzja

**Plan v2 → REWRITE do v3 zanim ruszymy z kodem.** Kluczowe zmiany:

1. **Faza 0 NEW (2-3h):** Separacja stores
   - `StudioSessionStore` — tabs, per-tab viewState (currentPage, zoom), UI flags, in-memory only
   - `PdfDocumentRepository` — IndexedDB-backed blob/snapshot storage
   - Cienki serwis `DocumentActions` jako facade

2. **Faza 1 (2-3h):** TabBar + Combine Wizard pełnoekranowy + ARIA + keyboard (Ctrl+Tab/W) — w **jednym** zakresie, nie addon

3. **Faza 2 (3-4.5h):** IndexedDB blobs przez native `idb-keyval` + structuredClone (NIE JSON), `skipHydration` + `hasHydrated` boot gate + integracja z `usePreferences()`, quota strategy (LRU + QuotaExceededError UX), `beforeunload` prompt

4. **Faza 1.5 PO Fazie 2 (2-3h):** Undo/redo per document — replay-based metadata (NIE snapshots), limit 20 ops, Ctrl+Z/Y shortcuts

5. **Faza 3 (1-2h):** Cloud sync metadata z **opt-in** + Recovery UX "Restore last session?"

6. **Faza 4 (1.5-2.5h):** Replikacja na alternate-merge / grid-combine / repair

**Łącznie:** must-have MDI = **7-10.5h** (nie 5-7h jak v2), pełny scope = **10.5-15h**.

### Notatka dla operatora

Cross-model review w **kluczowym momencie** zaoszczędził **dni debugowania** na produkcji. Per-tab viewState bug i hydration race byłyby **wykryte dopiero przez user'a** w Studio po deploy, nie przez testy lokalne. Empirycznie potwierdza wartość §25 — konsultacja PRZED implementacją w sprawach istotnych.
