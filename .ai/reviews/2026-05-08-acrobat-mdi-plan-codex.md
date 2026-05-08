STATUS: GO_WITH_CHANGES

Największe problemy nie są w UI tabs, tylko w modelu stanu i persystencji.

- Plan przecenia gotowość `studioStore` do MDI. W planie pada wniosek, że store “już jest pod MDI” [.ai/reviews/2026-05-08-acrobat-mdi-plan.md](</Users/dariuszciesielski/projekty/Access Manager/tools-PDFCraftTool/.ai/reviews/2026-05-08-acrobat-mdi-plan.md:26>), ale realnie `currentPage` i `zoomLevel` są globalne, a `selectFile()` resetuje stronę do `1` [studioStore.ts](</Users/dariuszciesielski/projekty/Access Manager/tools-PDFCraftTool/src/lib/stores/studioStore.ts:78>) [studioStore.ts](</Users/dariuszciesielski/projekty/Access Manager/tools-PDFCraftTool/src/lib/stores/studioStore.ts:149>) [PdfViewer.tsx](</Users/dariuszciesielski/projekty/Access Manager/tools-PDFCraftTool/src/components/studio/PdfViewer.tsx:17>) [PagesPanel.tsx](</Users/dariuszciesielski/projekty/Access Manager/tools-PDFCraftTool/src/components/studio/PagesPanel.tsx:36>). To łamie Acrobatowy mental model “wróć do dokumentu tam, gdzie go zostawiłem”. Przed tabs UI trzeba wprowadzić per-tab `viewState`.
- Faza 2 ma zły kierunek architektoniczny. `persist(createJSONStorage(...))` dla `files: state.files` [.ai/reviews/2026-05-08-acrobat-mdi-plan.md](</Users/dariuszciesielski/projekty/Access Manager/tools-PDFCraftTool/.ai/reviews/2026-05-08-acrobat-mdi-plan.md:85>) oznacza JSON-owanie całego stanu dokumentów przy każdej zmianie. To jest kosztowne i kruche dla `Uint8Array`/`File`, a obecne akcje często podmieniają cały bufor dokumentu [studioStore.ts](</Users/dariuszciesielski/projekty/Access Manager/tools-PDFCraftTool/src/lib/stores/studioStore.ts:156>) [studioStore.ts](</Users/dariuszciesielski/projekty/Access Manager/tools-PDFCraftTool/src/lib/stores/studioStore.ts:219>). Tu powinny być dwa poziomy: mały `session store` w Zustand i osobny IndexedDB `document repository` na bloby/snapshoty.
- Undo jest niedomodelowane i mocno niedoszacowane. Proponowane `PageOperation` z `removedData: Uint8Array` [.ai/reviews/2026-05-08-acrobat-mdi-plan.md](</Users/dariuszciesielski/projekty/Access Manager/tools-PDFCraftTool/.ai/reviews/2026-05-08-acrobat-mdi-plan.md:182>) nie jest wiarygodnym odwróceniem arbitralnej operacji PDF. Dodatkowo wiele narzędzi już działa jako “replace whole document” przez `replaceFileData()` [ToolDrawer.tsx](</Users/dariuszciesielski/projekty/Access Manager/tools-PDFCraftTool/src/components/studio/ToolDrawer.tsx:477>). Realistycznie: snapshoty per dokument z limitem albo replay operacji od bazowego blobu. To nie jest `+1h`.
- Plan pomija race conditions na boot/hydracji. Manualne `rehydrate()` w `StudioLayout` [.ai/reviews/2026-05-08-acrobat-mdi-plan.md](</Users/dariuszciesielski/projekty/Access Manager/tools-PDFCraftTool/.ai/reviews/2026-05-08-acrobat-mdi-plan.md:116>) będzie się ścierać z istniejącym mount-time sync z Supabase w `usePreferences()` [usePreferences.ts](</Users/dariuszciesielski/projekty/Access Manager/tools-PDFCraftTool/src/lib/hooks/usePreferences.ts:107>). Bez `skipHydration`, `hasHydrated`, kolejności restore i boot gate dostaniesz flicker/null state/late overwrites.
- Ryzyko quota/eviction jest potraktowane zbyt lekko. Założenie “50 MB OK” [.ai/reviews/2026-05-08-acrobat-mdi-plan.md](</Users/dariuszciesielski/projekty/Access Manager/tools-PDFCraftTool/.ai/reviews/2026-05-08-acrobat-mdi-plan.md:114>) jest zbyt optymistyczne, szczególnie dla Safari/iOS/private mode. Brakuje polityki `QuotaExceededError`, `navigator.storage.estimate()/persist()`, LRU cleanup, zasad co wolno auto-evictować i co zrobić, gdy dirty tab nie da się już zapisać.

Odpowiedzi na pytania:

1. Plan jest częściowo realistyczny, ale niekompletny. Sam problem UI multi-input jest trafnie rozpoznany, ale “tabu” obszary są właśnie tam, gdzie plan jest najsłabszy: App Router sam w sobie nie jest blockerem, za to serializacja binariów, boot lifecycle Zustand i rozdzielenie session state od document state są blockerami.
2. Największe ryzyka architektoniczne to: per-file undo memory bloat, bo snapshoty PDF są duże; persist race na mount, bo restore konkuruje z mount effects; quota/eviction, bo browser storage nie daje stabilnej gwarancji trwałości bez jawnej strategii i UX awaryjnego.
3. Pominięto: `beforeunload`/close-tab prompt dla dirty tabs, keyboard model dla tabs i undo/redo, focus management/full-screen wizard accessibility, mobile/touch fallback dla tab strip + DnD, testy hydracji/quota/corrupt DB, oraz decyzję czy nazwy plików wolno syncować do Supabase bez opt-in.
4. Kolejność faz wymaga korekty. Faza 1 może zostać jako in-memory tabs + combine, ale Faza 2 powinna wejść przed Fazą 1.5. Undo bez ustalonego modelu persystencji i snapshot storage będzie albo błędne, albo przerabiane drugi raz.
5. Lepsza architektura: osobny `StudioSessionStore` dla tabs/view state/UI, osobny `PdfDocumentRepository` na IndexedDB bloby/snapshoty, plus cienki serwis `DocumentActions`. Osobny store dla tabs ma sens. Klasa `PdfDocument` jako obiekt w Zustand ma mniejszy sens, bo utrudnia serializację; jako warstwa serwisowa poza storem już tak.

Nice-to-have, ale warto dopisać do planu od razu:

- Opt-in na cloud sync nazw plików, bo to nadal metadata potencjalnie wrażliwa.
- Overflow model dla tabs: scroll, keyboard nav, middle-click/close, close confirmation.
- Recovery UX: “restore last session?” zamiast bezwarunkowego przywracania po każdym reload.

Skorygowane estymaty AI+człowiek:

- Faza 0: rozdzielenie `session state` vs `document/blob state` + boot model: `2-3h`
- Faza 1: TabBar + full-screen combine wizard na in-memory store: `2-3h`
- Faza 2: IndexedDB blobs/snapshots + hydration gating + quota error path: `3-4.5h`
- Faza 1.5 po korekcie: undo/redo per dokument z limitem snapshotów + shortcuty: `2-3h`
- Faza 3: cross-device metadata sync z opt-in i restore UX: `1-2h`
- Faza 4: reuse wizard dla `alternate-merge` / `grid-combine` / `repair`: `1.5-2.5h`

Czyli:
- realne must-have MDI bez cloud sync: `7-10.5h`, nie `5-7h`
- pełny scope z undo + sync + reuse: `10.5-15h`

Jeśli miałbym zatwierdzić plan do wdrożenia, to tylko po jednej zmianie zasadniczej: najpierw rozdzielić model stanu na `tabs/session` i `documents/persistence`, a dopiero potem dokładać undo i cloud sync. Bez tego Faza 2 i 1.5 są architektonicznie zbyt kruche.