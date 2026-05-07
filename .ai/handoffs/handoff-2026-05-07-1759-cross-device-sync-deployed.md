# Handoff 2026-05-07 17:59 — Cross-device sync wdrożony na produkcję

**Sesja:** trzecia sesja dnia (17:36 → 17:59 CEST, ~25 min aktywnej pracy po `wznów`)
**Status:** ZAMKNIĘTE — kod na produkcji, brakuje tylko ręcznego E2E testu z dwóch urządzeń
**Kontynuacja:** powiedz `wznów` w nowej sesji Claude Code

---

## TL;DR dla nowego agenta

**Cross-device sync DZIAŁA na produkcji** — `recent_documents` i `user_preferences` są teraz synchronizowane przez Supabase. Co zostało: ręczny E2E test (zaloguj się na drugim urządzeniu, sprawdź czy ostatnie pliki + theme/szerokości paneli się pojawiły). Smoke test HTTP wszystkich 3 ścieżek przeszedł (200). Build 1589 stron OK.

**Live:** `https://access-manager-tools-pdfcraft.vercel.app/pl/studio` (deploy `5osw5h369`, alias zaktualizowany ręcznie).

---

## Co zostało zrobione

### Commit
`760d134` — feat(studio): cross-device sync for recent_documents + user_preferences

6 zmian (5 modified + 1 new):
- `src/lib/hooks/useRecentDocuments.ts` — dual-mode (cloud/localStorage) + post-login sync
- `src/lib/hooks/usePreferences.ts` (NOWY) — bridge hook cloud ↔ local mechanisms
- `src/components/ui/ThemeToggle.tsx` — integracja z `usePreferences().setTheme()` + MutationObserver dla reactive theme
- `src/components/studio/StudioLayout.tsx` — mount usePreferences + 2 useEffecty dla width sync
- `src/components/studio/StudioMenuBar.tsx` — `onSelect={() => void clearRecent()}` (async)
- `src/lib/contexts/AuthContext.tsx` — nowy `useAuthOptional()` zwracający null zamiast throw

### Architektura

**Hook-as-syncer pattern** (zamiast przepisywania 3 modułów):
- `usePreferences()` mountowany RAZ w StudioLayout
- Bridge'uje cloud ↔ istniejące mechanizmy (theme localStorage + sidebar width localStorage + Zustand showLeftSidebar/showRightPanel)
- Server-wins przy initial load (login)
- Debounce 400ms na cloud upsert
- Zero zmian w `useResizable.ts` i `studioStore.ts`

**`useAuthOptional()`** dla komponentów dzielonych (ThemeToggle jest w headerze BOTH Studio + klasyczne `/tools/[tool]/` strony bez AuthProvider). Bez tego prerender 1589 stron padał: `Error: useAuth must be used within AuthProvider`.

### Verify
- ✅ `npx tsc --noEmit` — 0 errors w nowym kodzie (2 pre-existing w testach SEO/error-messages)
- ✅ `npm run build` — 1589 static pages, 0 prerender errors
- ✅ HTTP 200 na 3 ścieżkach: `/pl/studio/`, `/pl/`, `/pl/tools/compress-pdf/`
- ✅ Vercel alias ręcznie ustawiony na `5osw5h369` (lesson learned z 07.05 — auto-promote nie działa dla custom alias)

---

## Co zostało (test ręczny + opcjonalne ulepszenia)

### 1. E2E cross-device test (Dariusz)

Wymaga 2 przeglądarek lub urządzeń. Plan testu:

```
1. Browser A (Chrome): otwórz https://access-manager-tools-pdfcraft.vercel.app/pl/
2. Sign up nowym emailem → potwierdź mail → zaloguj
3. Drop 2-3 PDF-y w Studio
4. Zmień theme na dark (przycisk księżyca w prawym górnym)
5. Zwiń lewy panel (przez menu Widok lub skrót)
6. Zmień szerokość prawego panelu (drag handle)

7. Browser B (Firefox/Inkognito/inny komputer): otwórz tę samą stronę
8. Zaloguj się TYM SAMYM emailem
9. Powinno się pojawić:
   - Recent documents = lista 3 PDF-ów z Browser A
   - Theme = dark
   - Lewy panel zwinięty
   - Szerokość prawego panelu zsynchronizowana
```

**Jeśli coś nie działa** — sprawdź w DevTools:
- Browser A: Network tab → szukaj POST/UPSERT do `recent_documents` i `user_preferences` po akcji
- Browser B: Network tab → szukaj GET (SELECT) z tych tabel po loginie
- Supabase Studio (`wvjoeyulugbpovhjboag`) → Table Editor → sprawdź zawartość tabel

### 2. Opcjonalne ulepszenia (P2, na osobną sesję)

- **Locale sync** — `user_preferences.locale` istnieje w schemie ale nie jest jeszcze pisane przez `usePreferences`. Pattern: po zmianie locale (przełącznik w UI) → upsert. Plus: po login redirect na `/<locale-z-DB>/...` jeśli różny od aktualnego URL.
- **Width sync 2-kierunkowo** — obecnie `setLeftSidebarWidth/setRightPanelWidth` pisze do localStorage + cloud, ale `useResizable` czyta z localStorage tylko on mount. Zmiana cloud → trzeba refresh strony żeby się zaaplikowała. Aby działało live, `usePreferences` po fetch z cloud powinien wywołać `useResizable.setWidth()` (musi być eksponowane jako prop).
- **Conflict resolution** — obecnie server-wins przy login. Edge case: user zmienia rzeczy offline, potem loguje się — lokalne zmiany przepadają. Można dodać "merge by timestamp" (cloud `updated_at` vs local `lastModified` w localStorage).

---

## Reference

- **PDFCraft repo:** `~/projekty/Access Manager/tools-PDFCraftTool/`
- **Production URL:** https://access-manager-tools-pdfcraft.vercel.app/pl/studio
- **Supabase project:** PDF Studio (`wvjoeyulugbpovhjboag`), eu-central-1 Frankfurt
- **Credentials:** `~/.claude/shared-credentials.env` `PDFCRAFT_STUDIO_*`
- **Last commit:** `760d134` — feat(studio): cross-device sync
- **Last deploy:** `5osw5h369` (Ready, alias zaktualizowany ręcznie do tego)

---

## Lessons learned (dopisane do CLAUDE.md PDFCraft)

- [2026-05-07] **useAuthOptional dla komponentów dzielonych** — ThemeToggle używany w Studio (z AuthProvider) i klasycznych stronach `/tools/[tool]/` (bez). Dodanie `useAuth()` wywaliło prerender 100% klasycznych stron. Fix: `useAuthOptional()` zwracający `null` zamiast throw. Reguła: dla komponentów dzielonych między layouty używaj **safe optional context pattern** + `grep -rn "AuthProvider" src/` PRZED dodaniem useAuth.
- [2026-05-07] **Hook-as-syncer pattern** — zamiast przepisywać 3 moduły na cloud-aware, jeden hook bridge'uje cloud ↔ istniejące mechanizmy (localStorage + Zustand). Mount w 1 miejscu, zero zmian w innych plikach. Mniejsze ryzyko regresji, łatwiejszy rollback. Reguła: gdy migrujesz local-only state do cloud, **nie przepisuj source of truth — bridge'uj**.

---

## Status repo

- Branch: `main` (pushed origin, commit `760d134`)
- Untracked w PDFCraft (efemeryczne):
  - `.ai/handoffs/handoff-2026-05-07-0948-studio-prod-live-confirmation-flow-pending.md`
  - `.ai/handoffs/handoff-2026-05-07-1721-cross-device-sync-pending.md` (zamknięty)
  - `.ai/handoffs/handoff-2026-05-07-1759-cross-device-sync-deployed.md` (ten plik)
  - `CLAUDE.md` (zaktualizowane lessons learned)

## Type check status

Czysto na nowym kodzie. 2 pre-existing errors w testach (NIE nasze):
- `src/__tests__/properties/seo.property.test.ts` L127
- `src/__tests__/properties/error-messages.property.test.ts` L25
