-- ─────────────────────────────────────────────────────────────────────────────
-- 0421 · merchant_subscription_renewal_attempts + merchant_subscription_notifications
--
-- Adds the lifecycle audit trail for merchant subscriptions:
--
--   merchant_subscription_renewal_attempts
--     One row per automated renewal attempt (success, insufficient wallet,
--     or other failure). Complements subscription_payments (money) and
--     merchant_subscription_refunds (refunds) — this table captures every
--     DECISION the auto-renew tick made, so ops can answer "why did this
--     merchant not renew?" without diffing multiple tables.
--     Idempotent via (subscription_id, billing_end_key) UNIQUE — a re-run
--     of the cron for the same billing cycle is a no-op.
--
--   merchant_subscription_notifications
--     One row per email/notification sent, keyed by dedupe_key so we cannot
--     spam the merchant (e.g. only one 3-day reminder per expiry date).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS merchant_subscription_renewal_attempts (
  id                        BIGSERIAL PRIMARY KEY,
  subscription_id           BIGINT NOT NULL REFERENCES merchant_subscriptions(id),
  merchant_id               BIGINT NOT NULL,
  store_id                  BIGINT NOT NULL REFERENCES merchant_stores(id),
  plan_id                   BIGINT REFERENCES merchant_plans(id),

  attempt_type              TEXT NOT NULL DEFAULT 'AUTO_RENEW_WALLET'
                              CHECK (attempt_type IN ('AUTO_RENEW_WALLET')),
  source                    TEXT NOT NULL DEFAULT 'CRON'
                              CHECK (source IN ('CRON','MANUAL')),

  -- Amounts (may be 0 for SKIPPED events)
  amount                    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_paise               BIGINT NOT NULL DEFAULT 0,
  gst_percent               NUMERIC(5,2) NOT NULL DEFAULT 0,
  gst_amount_paise          BIGINT NOT NULL DEFAULT 0,

  -- Outcome
  status                    TEXT NOT NULL
                              CHECK (status IN (
                                'SUCCESS',
                                'FAILED_INSUFFICIENT_WALLET',
                                'FAILED_OTHER',
                                'SKIPPED_NO_PLAN_PRICE'
                              )),
  failure_reason            TEXT,

  -- Debug snapshot
  wallet_balance_before     NUMERIC(14,2),

  -- Links to downstream artifacts (populated on SUCCESS)
  new_payment_id            BIGINT REFERENCES subscription_payments(id),
  new_wallet_ledger_id      BIGINT,
  new_expiry_date           TIMESTAMPTZ,

  -- Idempotency key derived from the billing cycle end. Unique on
  -- (subscription_id, billing_end_key) — the cron running twice for the
  -- same cycle inserts once and no-ops the second time.
  billing_end_key           BIGINT NOT NULL,

  attempted_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS
  merchant_subscription_renewal_attempts_sub_billing_uniq
  ON merchant_subscription_renewal_attempts (subscription_id, billing_end_key);

CREATE INDEX IF NOT EXISTS
  merchant_subscription_renewal_attempts_store_attempted_idx
  ON merchant_subscription_renewal_attempts (store_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS
  merchant_subscription_renewal_attempts_status_idx
  ON merchant_subscription_renewal_attempts (status, attempted_at DESC);


CREATE TABLE IF NOT EXISTS merchant_subscription_notifications (
  id                    BIGSERIAL PRIMARY KEY,
  subscription_id       BIGINT NOT NULL REFERENCES merchant_subscriptions(id),
  merchant_id           BIGINT NOT NULL,
  store_id              BIGINT NOT NULL REFERENCES merchant_stores(id),

  notification_type     TEXT NOT NULL
                          CHECK (notification_type IN (
                            'EXPIRY_REMINDER_3D',
                            'RENEW_SUCCESS',
                            'RENEW_FAILED_INSUFFICIENT',
                            'RENEW_FAILED_OTHER',
                            'EXPIRED'
                          )),
  channel               TEXT NOT NULL DEFAULT 'EMAIL'
                          CHECK (channel IN ('EMAIL')),

  recipient             TEXT NOT NULL,
  subject               TEXT,
  template_key          TEXT,

  status                TEXT NOT NULL
                          CHECK (status IN ('SENT','FAILED')),
  error_message         TEXT,
  payload               JSONB DEFAULT '{}'::jsonb,

  -- Dedupe: e.g. "reminder_3d_<subId>_<YYYYMMDDofExpiry>" so we send exactly
  -- one 3-day reminder per (subscription, expiry_date). Insert races safely
  -- via UNIQUE — the loser sees a 23505 and silently skips the send.
  dedupe_key            TEXT NOT NULL,

  sent_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS
  merchant_subscription_notifications_dedupe_uniq
  ON merchant_subscription_notifications (dedupe_key);

CREATE INDEX IF NOT EXISTS
  merchant_subscription_notifications_store_sent_idx
  ON merchant_subscription_notifications (store_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS
  merchant_subscription_notifications_sub_type_idx
  ON merchant_subscription_notifications (subscription_id, notification_type, sent_at DESC);

COMMENT ON TABLE merchant_subscription_renewal_attempts IS
  'Audit trail for auto-renewal attempts by the merchant subscription tick. See migration 0421.';
COMMENT ON TABLE merchant_subscription_notifications IS
  'Sent-notification log for merchant subscription lifecycle events. Dedupe_key prevents duplicate sends. See migration 0421.';
