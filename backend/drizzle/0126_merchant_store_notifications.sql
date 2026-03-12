-- ============================================================================
-- 0126_merchant_store_notifications
-- In-app notifications for a store (e.g. "Store opened. Scheduled off cleared.").
-- RLS: only store's parent (merchant partner) can read/update their store notifications.
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_store_notifications (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'system', -- 'order' | 'store' | 'system' | 'earning'
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  order_id BIGINT NULL, -- optional link to order for order-type notifications
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_store_notifications_store_id_idx
  ON merchant_store_notifications(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_notifications_store_read_created_idx
  ON merchant_store_notifications(store_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS merchant_store_notifications_unread_idx
  ON merchant_store_notifications(store_id) WHERE read = FALSE;

COMMENT ON TABLE merchant_store_notifications IS 'In-app notifications for merchant store (store opened, order, etc.).';

-- RLS: enable and policy so only the merchant partner that owns the store can access rows.
ALTER TABLE merchant_store_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT allowed for rows belonging to a valid store (API enforces parent_id ownership).
DROP POLICY IF EXISTS merchant_store_notifications_select_policy ON merchant_store_notifications;
CREATE POLICY merchant_store_notifications_select_policy ON merchant_store_notifications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM merchant_stores ms
      WHERE ms.id = merchant_store_notifications.store_id
        AND ms.deleted_at IS NULL
    )
  );

-- Allow UPDATE so app can mark as read.
DROP POLICY IF EXISTS merchant_store_notifications_update_policy ON merchant_store_notifications;
CREATE POLICY merchant_store_notifications_update_policy ON merchant_store_notifications
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM merchant_stores ms
      WHERE ms.id = merchant_store_notifications.store_id
        AND ms.deleted_at IS NULL
    )
  );

-- INSERT: only backend/service role inserts; restrict to store owner context if using Supabase auth.
DROP POLICY IF EXISTS merchant_store_notifications_insert_policy ON merchant_store_notifications;
CREATE POLICY merchant_store_notifications_insert_policy ON merchant_store_notifications
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM merchant_stores ms
      WHERE ms.id = merchant_store_notifications.store_id
        AND ms.deleted_at IS NULL
    )
  );
