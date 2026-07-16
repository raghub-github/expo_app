-- ─────────────────────────────────────────────────────────────────────────────
-- 0420 · merchant_subscription_refunds  — durable audit trail for every
-- subscription refund issued from the Control Dashboard.
--
-- Why this table exists:
--   subscription_payments rows get UPDATE'd in place when refunded (status →
--   REFUNDED / REFUND_PENDING). That destroys the historical trail: WHO
--   refunded WHAT, WHEN, WHY, and to WHERE (wallet ledger id or Razorpay
--   refund id). This table preserves every refund as an immutable audit row.
--
-- Access model (enforced at the API layer):
--   - Admin / super_admin / agents with REFUND action:
--       see everything including agent identity
--   - Merchant (partner site + merchant app):
--       see the refund happened + amount + when — NEVER the agent identity
--
-- The `actor_*` columns are captured at write time (not FK) so historical
-- rows stay stable if the agent user is later deleted or renamed.
--
-- One-refund-per-payment invariant: UNIQUE on payment_id. If the current
-- product decision changes to allow partial/multiple refunds per payment,
-- drop the unique index and add refund_sequence or amount_paise columns.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS merchant_subscription_refunds (
  id                     BIGSERIAL PRIMARY KEY,

  -- What was refunded
  payment_id             BIGINT NOT NULL REFERENCES subscription_payments(id),
  subscription_id        BIGINT NOT NULL REFERENCES merchant_subscriptions(id),
  merchant_id            BIGINT NOT NULL,
  store_id               BIGINT NOT NULL REFERENCES merchant_stores(id),
  plan_id                BIGINT REFERENCES merchant_plans(id),

  -- Money
  gateway                TEXT NOT NULL CHECK (gateway IN ('WALLET','RAZORPAY')),
  amount                 NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  total_paise            BIGINT NOT NULL CHECK (total_paise > 0),
  currency               TEXT NOT NULL DEFAULT 'INR',

  -- Where the money went / from
  --   WALLET  path: refund_reference = merchant_wallet_ledger.id (numeric string)
  --   RAZORPAY path: refund_reference = razorpay refund id (rfnd_XXX)
  refund_reference       TEXT NOT NULL,
  wallet_ledger_id       BIGINT,          -- populated for gateway=WALLET
  razorpay_refund_id     TEXT,            -- populated for gateway=RAZORPAY
  razorpay_payment_id    TEXT,            -- copy for indexing

  -- Lifecycle
  --   PENDING   — Razorpay refund initiated, waiting for refund.processed webhook
  --   COMPLETED — final state (wallet always; razorpay after webhook confirmation)
  --   FAILED    — Razorpay reported refund.failed
  status                 TEXT NOT NULL CHECK (status IN ('PENDING','COMPLETED','FAILED'))
                              DEFAULT 'COMPLETED',

  -- Reason + notes (admin-provided at refund time)
  reason                 TEXT NOT NULL,

  -- Actor identity — captured at write time so admin can never spoof
  -- and merchant can never see. FK NOT enforced so deletes don't cascade.
  actor_subject_id       TEXT NOT NULL,   -- raw sub from JWT / X-Actor-Subject-Id header
  actor_system_user_id   BIGINT,          -- resolved from system_users; nullable
  actor_email            TEXT,
  actor_name             TEXT,
  actor_role             TEXT NOT NULL,   -- admin | super_admin | manager | support

  -- Timestamps
  initiated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at           TIMESTAMPTZ,     -- set on COMPLETED transition
  failed_at              TIMESTAMPTZ,     -- set on FAILED transition
  failure_reason         TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One refund per payment. If you later want partial refunds, drop and rework.
CREATE UNIQUE INDEX IF NOT EXISTS merchant_subscription_refunds_payment_uniq
  ON merchant_subscription_refunds(payment_id);

-- Merchant-view lookups: "show me my store's refund history" — hot path.
CREATE INDEX IF NOT EXISTS merchant_subscription_refunds_store_initiated_idx
  ON merchant_subscription_refunds(store_id, initiated_at DESC);

-- Admin cross-merchant queries.
CREATE INDEX IF NOT EXISTS merchant_subscription_refunds_merchant_initiated_idx
  ON merchant_subscription_refunds(merchant_id, initiated_at DESC);

-- Subscription lifecycle joins.
CREATE INDEX IF NOT EXISTS merchant_subscription_refunds_subscription_idx
  ON merchant_subscription_refunds(subscription_id);

-- Webhook confirmation lookup — refund.processed sends razorpay_refund_id +
-- razorpay_payment_id but we key by refund_id first (more specific).
CREATE INDEX IF NOT EXISTS merchant_subscription_refunds_razorpay_refund_idx
  ON merchant_subscription_refunds(razorpay_refund_id)
  WHERE razorpay_refund_id IS NOT NULL;

-- Actor audit reports: "which agent issued the most refunds this month".
CREATE INDEX IF NOT EXISTS merchant_subscription_refunds_actor_idx
  ON merchant_subscription_refunds(actor_system_user_id, initiated_at DESC)
  WHERE actor_system_user_id IS NOT NULL;

-- Keep updated_at fresh on any mutation.
CREATE OR REPLACE FUNCTION touch_merchant_subscription_refunds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_merchant_subscription_refunds_updated_at
  ON merchant_subscription_refunds;
CREATE TRIGGER trg_touch_merchant_subscription_refunds_updated_at
  BEFORE UPDATE ON merchant_subscription_refunds
  FOR EACH ROW
  EXECUTE FUNCTION touch_merchant_subscription_refunds_updated_at();

COMMENT ON TABLE merchant_subscription_refunds IS
  'Immutable audit trail for merchant subscription refunds. One row per refund. See 0420_merchant_subscription_refunds_audit.sql for access model + column semantics.';
