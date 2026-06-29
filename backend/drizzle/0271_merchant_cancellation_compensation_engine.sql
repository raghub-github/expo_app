-- Merchant cancellation compensation engine (Super Admin configuration).
-- Zomato-style tiers: picked up, order-ready + accuracy, not ready, exclusions.
-- Run after 0270_rider_cancellation_penalty_engine.sql. Idempotent.

DO $$ BEGIN
  CREATE TYPE gm_merchant_compensation_scenario_code AS ENUM (
    'ORDER_PICKED_UP',
    'ORDER_READY_HIGH_ACCURACY',
    'ORDER_READY_LOW_ACCURACY',
    'NOT_ORDER_READY'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE gm_merchant_compensation_exclusion_code AS ENUM (
    'CUSTOMER_CANCEL_WITHIN_GRACE',
    'MERCHANT_ACCEPTED_CANCEL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS gm_merchant_compensation_engine_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  order_ready_accuracy_threshold NUMERIC(5, 2) NOT NULL DEFAULT 80.00,
  customer_cancel_grace_seconds INTEGER NOT NULL DEFAULT 60,
  amount_base TEXT NOT NULL DEFAULT 'NET_ORDER_VALUE',
  policy_modal_title TEXT NOT NULL DEFAULT 'Compensation Policy',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE gm_merchant_compensation_engine_settings IS
  'Global merchant cancellation compensation engine settings (Super Admin).';

INSERT INTO gm_merchant_compensation_engine_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS gm_merchant_compensation_scenario_config (
  scenario_code gm_merchant_compensation_scenario_code PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  compensation_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 100,
  policy_title TEXT NOT NULL DEFAULT '',
  policy_description TEXT NOT NULL DEFAULT '',
  ledger_title TEXT NOT NULL DEFAULT '',
  ledger_description TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gm_merchant_comp_scenario_pct_chk CHECK (
    compensation_pct >= 0 AND compensation_pct <= 100
  )
);

COMMENT ON TABLE gm_merchant_compensation_scenario_config IS
  'Compensation % merchant keeps on cancelled orders by scenario tier.';

INSERT INTO gm_merchant_compensation_scenario_config (
  scenario_code,
  is_enabled,
  compensation_pct,
  sort_order,
  policy_title,
  policy_description,
  ledger_title,
  ledger_description
)
VALUES
  (
    'ORDER_PICKED_UP',
    TRUE,
    100.00,
    10,
    'Order picked up by delivery partner',
    'You will receive 100% of the net order value if the order was already picked up by the delivery partner.',
    'Cancellation compensation (picked up)',
    'Compensation credited — order was picked up before cancellation.'
  ),
  (
    'ORDER_READY_HIGH_ACCURACY',
    TRUE,
    80.00,
    20,
    'Order ready + high marking accuracy',
    'You will receive 80% of the net order value if the order was not picked up but was marked Order ready, and your order ready marking accuracy was above the threshold in the previous week.',
    'Cancellation compensation (order ready)',
    'Compensation credited — order was marked ready and your marking accuracy met the weekly threshold.'
  ),
  (
    'ORDER_READY_LOW_ACCURACY',
    TRUE,
    40.00,
    30,
    'Order ready + low marking accuracy',
    'You will receive 40% of the net order value if the order was not picked up, was marked Order ready, but your order ready marking accuracy was below the threshold in the previous week.',
    'Cancellation compensation (order ready, low accuracy)',
    'Partial compensation — order was marked ready but marking accuracy was below the weekly threshold.'
  ),
  (
    'NOT_ORDER_READY',
    TRUE,
    40.00,
    40,
    'Order not marked ready',
    'You will receive 40% of the net order value if the order was not picked up and was not marked Order ready.',
    'Cancellation compensation (not ready)',
    'Partial compensation — order was not marked ready before cancellation.'
  )
ON CONFLICT (scenario_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS gm_merchant_compensation_exclusion_rules (
  exclusion_code gm_merchant_compensation_exclusion_code PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  policy_title TEXT NOT NULL DEFAULT '',
  policy_description TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE gm_merchant_compensation_exclusion_rules IS
  'Zero-compensation exclusions (grace cancel, merchant accepted cancel).';

INSERT INTO gm_merchant_compensation_exclusion_rules (
  exclusion_code,
  is_enabled,
  policy_title,
  policy_description
)
VALUES
  (
    'CUSTOMER_CANCEL_WITHIN_GRACE',
    TRUE,
    'Customer cancelled within grace period',
    'No compensation if the customer cancelled within the configured grace period after placing the order.'
  ),
  (
    'MERCHANT_ACCEPTED_CANCEL',
    TRUE,
    'Restaurant accepted cancellation',
    'No compensation if the restaurant accepted the cancellation request.'
  )
ON CONFLICT (exclusion_code) DO NOTHING;

UPDATE gm_party_penalty_panel
SET is_enabled = TRUE, updated_at = NOW()
WHERE party_code = 'MERCHANT';
