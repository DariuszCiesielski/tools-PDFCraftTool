

STATUS: GO_WITH_CHANGES

1) **Realizm i kompletność planu**
- `createJSONStorage` z `JSON.stringify` na `Uint8Array` to **krytyczny błąd**. `JSON.stringify` zamieni binary na base64 → +33% rozmiar, GC pressure, timeout przy >5MB. `idb-keyval` natywnie wspiera `Uint8Array` przez `structuredClone`, ale middleware JSON to psuje. Zamiast `createJSONStorage` użyj custom storage z `get/set` bezpośrednio na `idb-keyval`, lub `msgpack-lite`/`buffer` do serializacji.
- Next.js App Router (SSR) + async Zustand `persist` = **hydration mismatch**. `persist` hydrates async, ale SSR renderuje synchronicznie. Bez `useHydrated()` lub `useEffect` guard, użytkownik zobaczy flash of unstyled state / błędny `currentFileId`. Dodaj `const [hydrated, setHydrated] = useState(false)` + `useEffect(() => setHydrated(true), [])` lub `zustand-persist` z `onRehydrateStorage`.
- Estymaty: F1 (2-3h) realistyczne. F1.5 (1h) za optymistyczne (undo + keyboard + integration). F2 (1.5-2h) ryzykowne przez serializację i SSR hydration. F3 (1-1.5h) OK. F4 (0.5-1h) OK. **Realny scope: ~6-7h realnej pracy** (LLM+tools przyspieszają, ale technical debt w serializacji/hydration wymaga debugu).

2) **Największe ryzyka architektoniczne**
- **Undo memory bloat:** `previousData: Uint8Array` na każdej operacji. 50 edycji na 10MB PDF = 500MB+ w RAM. `pdf-lib` jest stateless → nie potrzebujesz bufferów. Zmień na `{ type: 'remove'|'reorder'|'replace', pageIndex: number, from?: number, to?: number }`. Replay wykonaj przez `pdf-lib` (clone → apply op → save). Ogranicz stack do 20 kroków, auto-trim.
- **Zustand rehydration race:** Async `getItem` zwraca promise. Zustand v4.30+ obsługuje async storage, ale w App Router `persist` może wywołać `set` po pierwszym renderze → niezdefiniowany `files` w `StudioLayout`. Rozwiązanie: `useSyncExternalStore` z `idb-keyval` lub `zustand` z `persist` + `onRehydrateStorage` synchronizującym stan przed mountem.
- **IndexedDB quota & cleanup:** `idb-keyval` nie zarządza lifecycleiem. 5 plików × 10MB = 50MB OK, ale przy 10+ plikach lub cache'owaniu starych wersji IDB rzuci `QuotaExceededError`. Dodaj `del(fileId)` przy `removeFile` lub limit max 3 pliki w IDB (reszta tylko w RAM).

3) **Co pominięto**
- **ARIA:** `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `role="tabpanel"`. Bez tego screen readers nie ogarną MDI.
- **Keyboard:** `Ctrl+Tab`/`Ctrl+Shift+Tab` switch, `Ctrl+W` close tab, `Esc` zamknij wizard, `Ctrl+Z` undo, `Ctrl+S` (opcjonalnie) save to IDB.
- **`beforeunload` prompt:** Gdy `version > 0` i user zamyka zakładkę lub stronę. Acrobat nie pyta, ale PDFCraft ma persystencję → user oczekuje, że zmiany przetrwają. Bez promptu = frustracja.
- **Mobile/touch:** Swipe between tabs, long-press context menu (close, rename), pinch-to-zoom w viewerze.

4) **Kolejność faz**
- F2 (IndexedDB) **powinna być przed F1.5 (undo)**. Undo state też musi przetrwać Cmd+R. Bez persistencji undo jest bezużyteczne po reloadu. Rekomendacja: F1 (UI + TabBar) → F2 (persistence + hydration fix + undo serialization) → F1.5 (undo logic + keyboard). Merge F1.5 w F2 oszczędzi ~0.5h na integracji.

5) **Lepsze alternatywy**
- **Tab state jako osobny store:** `tabStore.ts` (order, activeId, dirtyFlags) vs `studioStore.ts` (page operations). Zustand już to wspiera, ale rozdzielenie uprości rehydration, testy i uniknie blokad przy heavy page edits.
- **`PdfDocument` class zamiast interface:** Enkapsuluje `undoStack`, `version`, `data`, metody `undo()`, `redo()`, `applyOp()`. Interface jest OK, ale class ułatwi per-tab state management i testy undo replay.
- **Zamiast `idb-keyval` + JSON:** Użyj `idb` directly z `structuredClone` lub `msgpack-lite` do binarek. `idb-keyval` jest OK, ale `createJSONStorage` to anty-pattern dla Uint8Array.

**Rekomendacja:** GO_WITH_CHANGES. Zmień serializację na native Uint8Array, dodaj hydration guard, ogranicz undo do 20 kroków bez bufferów, przenieś F2 przed F1.5, dodaj ARIA/keyboard. Estyma: **6h realnej pracy** (LLM+tools + precyzyjne specy).
