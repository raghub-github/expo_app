-- ============================================================================
-- 0063: Add source column to blacklist_history for audit (agent vs system)
-- ============================================================================

-- Create enum for who performed the blacklist/whitelist action
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'blacklist_source') THEN
    CREATE TYPE blacklist_source AS ENUM ('agent', 'system', 'automated');
  END IF;
END $$;

-- Add source column with default for backward compatibility
ALTER TABLE blacklist_history
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'agent';

-- If column was added as enum elsewhere, ensure we use text for flexibility
-- (Drizzle can use text("source") in schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blacklist_history' AND column_name = 'source'
  ) THEN
    -- Ensure existing rows have a value
    UPDATE blacklist_history SET source = 'agent' WHERE source IS NULL OR source = '';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS blacklist_history_source_idx ON blacklist_history(source);

COMMENT ON COLUMN blacklist_history.source IS 'Who performed the action: agent (dashboard), system, automated.';
