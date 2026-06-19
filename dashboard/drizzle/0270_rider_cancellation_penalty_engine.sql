-- Rider cancellation penalty engine (Super Admin configuration).
-- Run after 0235–0236 (order_cancellation_reason_catalog + attributes).
-- Idempotent where possible.

DO $$ BEGIN
  CREATE TYPE gm_penalty_party_code AS ENUM ('RIDER', 'MERCHANT', 'CUSTOMER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE gm_rider_penalty_scenario_code AS ENUM (
    'AFTER_ACCEPT_DISPATCH',
    'AFTER_MARK_PICKUP'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE gm_rider_penalty_amount_base AS ENUM (
    'DELIVERY_FARE',
    'COMPLETE_ORDER_VALUE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS gm_party_penalty_panel (
  party_code gm_penalty_party_code PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  panel_label TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE gm_party_penalty_panel IS
  'Super Admin party toggle (Rider / Merchant / Customer penalty panels).';

INSERT INTO gm_party_penalty_panel (party_code, is_enabled, panel_label)
VALUES
  ('RIDER', TRUE, 'Rider'),
  ('MERCHANT', FALSE, 'Merchant'),
  ('CUSTOMER', FALSE, 'Customer')
ON CONFLICT (party_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS gm_rider_penalty_scenario_config (
  id SERIAL PRIMARY KEY,
  scenario_code gm_rider_penalty_scenario_code NOT NULL UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  flat_penalty_amount NUMERIC(12, 2),
  ledger_title TEXT NOT NULL DEFAULT '',
  ledger_description TEXT NOT NULL DEFAULT '',
  penalty_title TEXT NOT NULL DEFAULT '',
  amount_base gm_rider_penalty_amount_base,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID,
  CONSTRAINT gm_rider_penalty_scenario_after_accept_chk CHECK (
    scenario_code <> 'AFTER_ACCEPT_DISPATCH'
    OR (flat_penalty_amount IS NULL OR flat_penalty_amount >= 0)
  )
);

COMMENT ON TABLE gm_rider_penalty_scenario_config IS
  'Rider penalty amounts/titles for post-dispatch and post-pickup cancellations.';

COMMENT ON COLUMN gm_rider_penalty_scenario_config.flat_penalty_amount IS
  'Fixed ₹ penalty when rider cancels after accepting a dispatched offer.';

COMMENT ON COLUMN gm_rider_penalty_scenario_config.amount_base IS
  'For AFTER_MARK_PICKUP: debit rider wallet by delivery fare or full customer order value.';

INSERT INTO gm_rider_penalty_scenario_config (
  scenario_code,
  is_enabled,
  flat_penalty_amount,
  ledger_title,
  ledger_description,
  penalty_title,
  amount_base
)
VALUES
  (
    'AFTER_ACCEPT_DISPATCH',
    TRUE,
    50.00,
    'Ride cancelled after dispatch',
    'Penalty applied because your ride was cancelled after you accepted the dispatched offer.',
    '',
    NULL
  ),
  (
    'AFTER_MARK_PICKUP',
    TRUE,
    NULL,
    '',
    'Penalty applied because the order was cancelled after you marked it picked up.',
    'Order cancelled after pickup',
    'DELIVERY_FARE'
  )
ON CONFLICT (scenario_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS gm_rider_penalty_reason_rules (
  id SERIAL PRIMARY KEY,
  scenario_code gm_rider_penalty_scenario_code NOT NULL,
  catalog_reason_id INTEGER NOT NULL REFERENCES order_cancellation_reason_catalog(id) ON DELETE CASCADE,
  applies_penalty BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scenario_code, catalog_reason_id)
);

CREATE INDEX IF NOT EXISTS idx_gm_rider_penalty_reason_rules_scenario
  ON gm_rider_penalty_reason_rules (scenario_code);

COMMENT ON TABLE gm_rider_penalty_reason_rules IS
  'Maps order_cancellation_reason_catalog (RIDER / 3PL fault) to penalty scenarios.';

INSERT INTO gm_rider_penalty_reason_rules (scenario_code, catalog_reason_id, applies_penalty)
SELECT s.scenario_code, c.id, FALSE
FROM order_cancellation_reason_catalog c
CROSS JOIN (
  SELECT unnest(ARRAY['AFTER_ACCEPT_DISPATCH', 'AFTER_MARK_PICKUP']::gm_rider_penalty_scenario_code[]) AS scenario_code
) s
WHERE upper(trim(c.attribute)) = 'RIDER'
  AND c.is_active = TRUE
ON CONFLICT (scenario_code, catalog_reason_id) DO NOTHING;
