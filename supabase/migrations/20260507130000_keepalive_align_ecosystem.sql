-- PDFCraft Studio — wyrównanie schematu _keepalive z ekosystemem PM
-- Reason: PM keepalive cron (route.ts) używa kolumny `pinged_at` + POST z resolution=merge-duplicates
-- PDF Studio miał `last_ping` + brak INSERT policy → POST padał (silent failure, lekcja 01.05)

ALTER TABLE public._keepalive RENAME COLUMN last_ping TO pinged_at;

DROP POLICY IF EXISTS "Anon can insert keepalive" ON public._keepalive;
CREATE POLICY "Anon can insert keepalive"
  ON public._keepalive
  FOR INSERT TO anon
  WITH CHECK (true);

-- PostgREST schema cache reload (lekcja 29.04 — bez tego pierwsze REST calls dają PGRST205)
NOTIFY pgrst, 'reload schema';
