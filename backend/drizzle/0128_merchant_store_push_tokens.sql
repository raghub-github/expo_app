-- ============================================================================
-- 0128_merchant_store_push_tokens
-- Stores Expo push tokens for merchant app devices per store.
-- Backend uses these to send background reminders (1 hour before scheduled closure).
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_store_push_tokens (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(store_id, token)
);

CREATE INDEX IF NOT EXISTS merchant_store_push_tokens_store_id_idx
  ON merchant_store_push_tokens(store_id);

ALTER TABLE merchant_store_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_store_push_tokens_select_policy ON merchant_store_push_tokens;
CREATE POLICY merchant_store_push_tokens_select_policy ON merchant_store_push_tokens
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM merchant_stores ms
      WHERE ms.id = merchant_store_push_tokens.store_id
        AND ms.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS merchant_store_push_tokens_insert_policy ON merchant_store_push_tokens;
CREATE POLICY merchant_store_push_tokens_insert_policy ON merchant_store_push_tokens
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM merchant_stores ms
      WHERE ms.id = merchant_store_push_tokens.store_id
        AND ms.deleted_at IS NULL
    )
  );

