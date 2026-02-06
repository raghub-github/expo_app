-- ============================================================================
-- 0070: Add actor_email to blacklist_history for reliable agent display
-- ============================================================================
-- Stores the agent's email at insert time so the UI can show it even when
-- admin_user_id is null (e.g. user not in system_users, or legacy rows).
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'blacklist_history' AND column_name = 'actor_email'
  ) THEN
    ALTER TABLE blacklist_history
      ADD COLUMN actor_email TEXT;
    COMMENT ON COLUMN blacklist_history.actor_email IS 'Email of agent who performed the action (when source=agent); stored at insert for reliable display.';
  END IF;
END $$;
