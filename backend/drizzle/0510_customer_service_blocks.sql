-- 0510: Per-service customer blocks (dashboard admin → customer app enforcement + audit history)

DO $$ BEGIN
  CREATE TYPE customer_service_type AS ENUM ('food', 'parcel', 'person_ride');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS customer_service_blocks (
  id              BIGSERIAL PRIMARY KEY,
  customer_id     INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_type    customer_service_type NOT NULL,
  reason          TEXT NOT NULL,
  blocked_by      INTEGER REFERENCES system_users(id) ON DELETE SET NULL,
  blocked_by_email TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unblocked_at    TIMESTAMPTZ,
  unblocked_by    INTEGER REFERENCES system_users(id) ON DELETE SET NULL,
  unblocked_by_email TEXT,
  unblock_reason  TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_service_blocks_active_unique_idx
  ON customer_service_blocks (customer_id, service_type)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS customer_service_blocks_customer_idx
  ON customer_service_blocks (customer_id);

CREATE INDEX IF NOT EXISTS customer_service_blocks_active_idx
  ON customer_service_blocks (customer_id, is_active)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS customer_service_block_history (
  id              BIGSERIAL PRIMARY KEY,
  customer_id     INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_type    customer_service_type NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('block', 'unblock')),
  reason          TEXT NOT NULL,
  actor_id        INTEGER REFERENCES system_users(id) ON DELETE SET NULL,
  actor_email     TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_service_block_history_customer_idx
  ON customer_service_block_history (customer_id, created_at DESC);

COMMENT ON TABLE customer_service_blocks IS
  'Active per-service blocks for customers (food / parcel / person_ride). Reason shown in customer app.';

COMMENT ON TABLE customer_service_block_history IS
  'Immutable audit log of customer service block and unblock actions from control dashboard.';
