-- Faza 3: cross-device sync metadata for PDF Studio
-- Adds tab_state columns to recent_documents + sync_metadata_enabled to user_preferences

ALTER TABLE recent_documents
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS page_count INTEGER,
  ADD COLUMN IF NOT EXISTS current_page INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS zoom_level FLOAT DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS scroll_top FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active_tab BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_recent_documents_content_hash
  ON recent_documents(user_id, content_hash)
  WHERE content_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION update_recent_documents_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recent_documents_updated_at ON recent_documents;
CREATE TRIGGER recent_documents_updated_at
  BEFORE UPDATE ON recent_documents
  FOR EACH ROW EXECUTE FUNCTION update_recent_documents_timestamp();

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS sync_metadata_enabled BOOLEAN DEFAULT FALSE;

-- Reload PostgREST schema cache (klasyczny gotcha po ALTER TABLE — bez tego REST API zwraca HTTP 500)
NOTIFY pgrst, 'reload schema';
