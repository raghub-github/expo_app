-- ============================================================================
-- 0071: Add source and reversed_by to rider_penalties for audit tracking
-- ============================================================================
-- source: who imposed the penalty ('agent' = manual by dashboard user, 'system' = automatic)
-- reversed_by: system_users.id of the agent who reverted the penalty (when status = 'reversed')
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rider_penalties' AND column_name = 'source'
  ) THEN
    ALTER TABLE rider_penalties
      ADD COLUMN source TEXT DEFAULT 'agent';
    COMMENT ON COLUMN rider_penalties.source IS 'Who imposed: agent (manual/dashboard) or system (automatic).';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rider_penalties' AND column_name = 'reversed_by'
  ) THEN
    ALTER TABLE rider_penalties
      ADD COLUMN reversed_by INTEGER REFERENCES system_users(id) ON DELETE SET NULL;
    COMMENT ON COLUMN rider_penalties.reversed_by IS 'Agent (system_users.id) who reverted this penalty; set when status = reversed.';
  END IF;
END $$;
