-- ============================================================================
-- 0205_merchant_store_notifications_read_ensure
-- Ensures `read` exists on merchant_store_notifications for merchant app + partner
-- site notification lists (0126 already adds it; this migration is idempotent for
-- older or forked databases).
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchant_store_notifications'
      AND column_name = 'read'
  ) THEN
    ALTER TABLE merchant_store_notifications
      ADD COLUMN read BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS merchant_store_notifications_store_read_created_idx
  ON merchant_store_notifications (store_id, read, created_at DESC);

CREATE INDEX IF NOT EXISTS merchant_store_notifications_unread_idx
  ON merchant_store_notifications (store_id) WHERE read = FALSE;
