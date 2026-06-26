-- ============================================================================
-- 0080: Add resolved_by to tickets for "resolved by whom" audit
-- ============================================================================
-- References system_users.id; when a ticket is resolved/closed, set resolved_by
-- to the agent who performed the action so the UI can show "Resolved by".
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'resolved_by'
  ) THEN
    ALTER TABLE tickets
      ADD COLUMN resolved_by INTEGER REFERENCES system_users(id) ON DELETE SET NULL;
    COMMENT ON COLUMN tickets.resolved_by IS 'System user ID of agent who resolved/closed the ticket.';
    CREATE INDEX IF NOT EXISTS tickets_resolved_by_idx ON tickets(resolved_by) WHERE resolved_by IS NOT NULL;
  END IF;
END $$;
