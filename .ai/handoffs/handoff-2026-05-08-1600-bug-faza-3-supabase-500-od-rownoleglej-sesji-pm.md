# Handoff dla sesji PDFCraft — 2026-05-08 16:00 — Bug Faza 3 Supabase 500 (od sesji PM)

**Autor:** sesja Claude PM (wznów był pomyłkowy → trafiłem do PDFCraft, dokończyłem smoke test który wykrył 1 bug)
**Status:** ZAOTWARTE — wymaga decyzji w sesji PDFCraft
**Cel:** przekazać wynik smoke testu Fazy 2 + wykryty bug Fazy 3 zanim pójdzie cleanup ekspertyzy

## TL;DR

Smoke test Fazy 2 (commit `bdb372e`) PASS dla 3 scenariuszy. Faza 3 (commit `b4aaab2`) deployed przez tę sesję (alias na `mpzhn48cd`), ale `useTabStateSync.ts` upsert do Supabase zwraca **HTTP 500** w prod. To znaczy że hook próbuje wysłać dane (czyli `syncMetadataEnabled === true` w storze), a Supabase odrzuca.

## Smoke test wyniki — Faza 2 (deploy `diy167puc` przez tę sesję)

PASS:
1. **reload + restore 1 plik** — RestoreSessionPrompt pojawił się przy initial navigate
2. **multi-upload 2 PDF + reload** — wszystkie 3 pliki w prompt (test fix `f215f1d` persist OK)
3. **restore bez kolizji ID** — 3 unique IDs zachowane przez restore (`1778248453374-6uf7dy8`, `1778248714250-4tsh7ya`, `1778248714250-eerb2rt`), test fix `bdb372e` B5 OK

Test PDFs wygenerowane Pythonem (reportlab) — `.playwright-mcp/test.pdf` (2 strony) + `test2.pdf` (1 strona).

## Bug Faza 3 (deploy `mpzhn48cd` od równoległej sesji PDFCraft)

**Console error w produkcji:**
```
Failed to load resource: 500
@ https://wvjoeyulugbpovhjboag.supabase.co/rest/v1/recent_documents
?on_conflict=user_id%2Cfile_name
&columns=%22user_id%22%2C%22file_name%22%2C%22file_size%22%2C%22content_hash%22
%2C%22page_count%22%2C%22current_page%22%2C%22zoom_level%22%2C%22scroll_top%22
%2C%22order_index%22%2C%22is_active_tab%22%2C%22last_opened_at%22
```

**2 hipotezy do weryfikacji** (kolejność diagnostyki):

### H1 (najbardziej prawdopodobna): Schema migracji Fazy 3 nieaplikowana
Per commit `b4aaab2` msg, migracja `ALTER TABLE recent_documents (8 kolumn)` + `user_preferences (sync_metadata_enabled)` + `trigger updated_at`. Ale w `b4aaab2 --name-only` brakuje pliku migracji (`supabase/migrations/`). Możliwe że została aplikowana **tylko przez Supabase MCP do prod**, NIE wpisana do repo (pattern z lekcji 2026-04-27 PM).

**Diagnostyka:**
```bash
# Sprawdź czy kolumny istnieją w prod
psql "$PDFCRAFT_STUDIO_SUPABASE_URL" -c "\\d recent_documents"
# lub przez MCP execute_sql:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'recent_documents' AND table_schema = 'public';
```

**Fix:** dopisać migrację do `supabase/migrations/` z timestamp version + `NOTIFY pgrst, 'reload schema';` (lekcja 2026-04-29 PM).

### H2: `syncMetadataEnabled` ON pomimo default OFF
Audyt kodu (Faza 3 `useTabStateSync.ts` linia 55-69) potwierdza że hook NIE odpala upsertu gdy `!syncEnabled || tabs.length === 0`. Skoro upsert leci → flag jest TRUE.

Default OFF per Codex finding (commit msg). Możliwe wyjaśnienia:
- Inna sesja włączyła toggle w trakcie testu (mało prawdopodobne, ja byłem auth jako Dariusz)
- Default w `usePreferences.ts` lub Zustand initState się zmienił
- Bug w persist preferences (np. read od Supabase zwraca undefined → JS coerce do TRUE?)

**Diagnostyka:**
- W konsoli prod: `useStudioSessionStore.getState().syncMetadataEnabled` (na zalogowanej sesji)
- Sprawdzić `user_preferences` table content dla user_id Dariusza

## Audit USP Fazy 3 — PASS (od sesji PM)

Code review `useTabStateSync.ts` + `contentHash.ts` + `SettingsModal.tsx` + i18n:

✅ **payload to wyłącznie metadane operacyjne** (file_name, file_size, content_hash SHA-256(name+size), page_count, current_page, zoom_level, scroll_top, order_index, is_active_tab, last_opened_at). **Brak buffer/blob/binary hash/zawartości pliku.**

✅ **Privacy warning wzorcowo transparentny** (pl.json):
> "Pamiętaj: nazwy plików (np. „umowa-rozwodowa.pdf") będą zapisane w naszej chmurze. Jeśli to wrażliwe — pozostaw wyłączone."

✅ Default OFF w SettingsModal (per Codex finding), gate w hook.

USP "Twoje pliki nigdy nie opuszczają urządzenia" zachowany **w intencji kodu**. Bug 500 to problem schema/state, NIE USP leakage.

## Współpraca między sesjami — kolizja zaobserwowana

Przy mojej sesji PM (wznów 15:44) zarobiłem deploy `diy167puc` Fazy 2 + alias set. Równolegle Twoja sesja PDFCraft zrobiła Fazę 1.5 (commit `278257b` 15:48) + 3 deploye + alias set na `mpzhn48cd`. Last-writer-wins → mój alias nadpisany twoim. Praca nie stracona, ale **race condition w Vercel CLI alias set jest realna** dla multi-agent workflow.

Sugestia: lock przed alias set (np. plik `.vercel-alias-lock` w repo, sprawdź mtime <60s przed alias).

## Co NIE robione w mojej sesji

- Smoke test Fazy 1.5 (undo/redo replay-based) — Twoja praca, ja nie testowałem
- Smoke test SettingsModal end-to-end (otwarcie modal + toggle + sync trigger) — niezweryfikowane przez UI, tylko code review
- E2E weryfikacja `recent_documents.tab_state` content (psql query) — handoff z 13:00 wymagał, nie zrobione przez kolizję sesji + Dariusz powiedział "audit zrobię później"

## Reference

- Mój smoke test ID-y zakładek po restore: `1778248453374-6uf7dy8` (test.pdf 1 strona z prev session), `1778248714250-4tsh7ya` + `1778248714250-eerb2rt` (mój multi-upload)
- Console errors snapshot: `.playwright-mcp/console-2026-05-08T13-58-56-533Z.log` (w PM repo `.playwright-mcp/`)
- Audit USP code-level: czytałem `git show b4aaab2:src/lib/hooks/useTabStateSync.ts` + `contentHash.ts` + `SettingsModal.tsx` + `messages/pl.json`

---

**Status:** ZAOTWARTE. Akcja: zdiagnozować H1 (schema) → H2 (state) → fix przed real user opt-in test.
