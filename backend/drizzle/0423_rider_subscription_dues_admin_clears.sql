-- ─────────────────────────────────────────────────────────────────────────────
-- 0423 · rider_subscription_dues_admin_clears
--
-- Audit trail when a dashboard admin clears rider subscription dues.
-- Complements wallet_ledger (money movement) and generic action audit logs —
-- this table is the ops-facing record of WHO cleared HOW MUCH and WHY the
-- wallet moved further negative.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rider_subscription_dues_admin_clears (
  id                        BIGSERIAL PRIMARY KEY,
  rider_id                  INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- Amounts at clear time
  cleared_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  dues_outstanding_before   NUMERIC(12,2) NOT NULL DEFAULT 0,
  wallet_balance_before     NUMERIC(14,2),
  wallet_balance_after      NUMERIC(14,2),

  -- Duty / block snapshot
  dispatch_blocked_before   BOOLEAN NOT NULL DEFAULT FALSE,
  penalty_streak_days_before INTEGER,

  -- Ledger link (nullable if clear was flags-only with ₹0 outstanding)
  wallet_ledger_id          BIGINT,
  wallet_ledger_ref         TEXT,

  -- Admin actor
  cleared_by_system_user_id INTEGER REFERENCES system_users(id) ON DELETE SET NULL,
  cleared_by_email          TEXT,
  cleared_by_name           TEXT,
  cleared_by_auth_id        TEXT,

  note                      TEXT,
  metadata                  JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rider_subscription_dues_admin_clears_rider_created_idx
  ON rider_subscription_dues_admin_clears (rider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rider_subscription_dues_admin_clears_admin_created_idx
  ON rider_subscription_dues_admin_clears (cleared_by_system_user_id, created_at DESC);

COMMENT ON TABLE rider_subscription_dues_admin_clears IS
  'Audit log of admin-initiated subscription dues clears (dashboard Clear button).';

COMMENT ON COLUMN rider_subscription_dues_admin_clears.cleared_amount IS
  'Amount debited from rider wallet when dues were cleared (0 if flags-only clear).';
