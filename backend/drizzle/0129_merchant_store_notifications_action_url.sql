-- ============================================================================
-- 0129_merchant_store_notifications_action_url
-- Adds deep-link target so tapping a notification can open a specific screen.
-- ============================================================================

ALTER TABLE merchant_store_notifications
ADD COLUMN IF NOT EXISTS action_url TEXT NULL;

CREATE INDEX IF NOT EXISTS merchant_store_notifications_action_url_idx
  ON merchant_store_notifications(store_id, created_at DESC)
  WHERE action_url IS NOT NULL;

