-- ============================================================================
-- 0127_merchant_store_scheduled_closures
-- Future scheduled closures (time off) that activate at a specific start time.
-- The store should only go OFFLINE when starts_at is reached.
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_store_scheduled_closures (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'cancelled', 'completed')),
  reminder_sent_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active/scheduled closure per store (optional but simplifies UI).
CREATE UNIQUE INDEX IF NOT EXISTS merchant_store_scheduled_closures_one_open_idx
  ON merchant_store_scheduled_closures(store_id)
  WHERE status IN ('scheduled', 'active');

CREATE INDEX IF NOT EXISTS merchant_store_scheduled_closures_store_status_idx
  ON merchant_store_scheduled_closures(store_id, status, starts_at);

CREATE INDEX IF NOT EXISTS merchant_store_scheduled_closures_reminder_idx
  ON merchant_store_scheduled_closures(starts_at)
  WHERE reminder_sent_at IS NULL AND status = 'scheduled';

ALTER TABLE merchant_store_scheduled_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_store_scheduled_closures_select_policy ON merchant_store_scheduled_closures;
CREATE POLICY merchant_store_scheduled_closures_select_policy ON merchant_store_scheduled_closures
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM merchant_stores ms
      WHERE ms.id = merchant_store_scheduled_closures.store_id
        AND ms.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS merchant_store_scheduled_closures_update_policy ON merchant_store_scheduled_closures;
CREATE POLICY merchant_store_scheduled_closures_update_policy ON merchant_store_scheduled_closures
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM merchant_stores ms
      WHERE ms.id = merchant_store_scheduled_closures.store_id
        AND ms.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS merchant_store_scheduled_closures_insert_policy ON merchant_store_scheduled_closures;
CREATE POLICY merchant_store_scheduled_closures_insert_policy ON merchant_store_scheduled_closures
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM merchant_stores ms
      WHERE ms.id = merchant_store_scheduled_closures.store_id
        AND ms.deleted_at IS NULL
    )
  );

