-- 0468: Pre-pickup cancellation compensation engine (ride / parcel / food).
-- Configurable formulas + immutable settlement store.

CREATE TABLE IF NOT EXISTS service_cancellation_compensation_rules (
  id                      bigserial PRIMARY KEY,
  service_type            text NOT NULL CHECK (service_type IN ('ride', 'parcel', 'food')),
  geo_level               text,
  geo_ref_id              text,
  name                    text NOT NULL DEFAULT 'Pre-pickup compensation',
  is_active               boolean NOT NULL DEFAULT FALSE,
  -- Applies when rider has reached pickup and customer cancels
  requires_rider_at_pickup boolean NOT NULL DEFAULT TRUE,
  calc_type               text NOT NULL DEFAULT 'FIXED'
                          CHECK (calc_type IN ('FIXED', 'PER_KM', 'PERCENTAGE')),
  value_numeric           numeric(14, 4) NOT NULL DEFAULT 0,
  min_compensation        numeric(14, 2),
  max_compensation        numeric(14, 2),
  include_waiting_compensation boolean NOT NULL DEFAULT TRUE,
  waiting_compensation_per_min numeric(14, 4) NOT NULL DEFAULT 0,
  payer_mode              text NOT NULL DEFAULT 'CUSTOMER_100'
                          CHECK (payer_mode IN ('CUSTOMER_100', 'COMPANY_100', 'SHARED')),
  customer_share_pct      numeric(6, 3) NOT NULL DEFAULT 100,
  company_share_pct       numeric(6, 3) NOT NULL DEFAULT 0,
  priority                int NOT NULL DEFAULT 100,
  metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT NOW(),
  updated_at              timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS svc_cancel_comp_rules_svc_idx
  ON service_cancellation_compensation_rules (service_type, is_active, priority DESC);

CREATE INDEX IF NOT EXISTS svc_cancel_comp_rules_geo_idx
  ON service_cancellation_compensation_rules (service_type, geo_level, geo_ref_id)
  WHERE is_active = TRUE;

COMMENT ON TABLE service_cancellation_compensation_rules IS
  'Pre-pickup cancellation compensation when rider reached pickup and customer cancels. Inactive by default.';

CREATE TABLE IF NOT EXISTS service_cancellation_settlements (
  id                      bigserial PRIMARY KEY,
  settlement_id           text NOT NULL UNIQUE,
  order_core_id           bigint NOT NULL REFERENCES orders_core(id) ON DELETE CASCADE,
  service_type            text NOT NULL CHECK (service_type IN ('ride', 'parcel', 'food')),
  rider_id                integer,
  customer_id             bigint,
  rule_id                 bigint REFERENCES service_cancellation_compensation_rules(id) ON DELETE SET NULL,
  rider_at_pickup         boolean NOT NULL DEFAULT FALSE,
  pickup_km               numeric(10, 3) NOT NULL DEFAULT 0,
  waiting_minutes         numeric(10, 2) NOT NULL DEFAULT 0,
  base_compensation       numeric(14, 2) NOT NULL DEFAULT 0,
  waiting_compensation    numeric(14, 2) NOT NULL DEFAULT 0,
  total_compensation      numeric(14, 2) NOT NULL DEFAULT 0,
  customer_share          numeric(14, 2) NOT NULL DEFAULT 0,
  company_share           numeric(14, 2) NOT NULL DEFAULT 0,
  payer_mode              text NOT NULL,
  calc_type               text NOT NULL,
  status                  text NOT NULL DEFAULT 'settled'
                          CHECK (status IN ('pending', 'settled', 'failed', 'reversed')),
  wallet_credited         boolean NOT NULL DEFAULT FALSE,
  breakdown               jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
  posted_at               timestamptz NOT NULL DEFAULT NOW(),
  created_at              timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS svc_cancel_settle_order_uidx
  ON service_cancellation_settlements (order_core_id);

CREATE INDEX IF NOT EXISTS svc_cancel_settle_rider_idx
  ON service_cancellation_settlements (rider_id, posted_at DESC);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='riders')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='svc_cancel_settle_rider_fkey') THEN
    ALTER TABLE service_cancellation_settlements
      ADD CONSTRAINT svc_cancel_settle_rider_fkey
      FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON TABLE service_cancellation_settlements IS
  'Immutable per-order pre-pickup cancellation compensation settlement.';

-- Seed one inactive default ride rule (admin enables).
INSERT INTO service_cancellation_compensation_rules (
  service_type, name, is_active, calc_type, value_numeric,
  min_compensation, max_compensation, include_waiting_compensation,
  waiting_compensation_per_min, payer_mode, priority, metadata
)
SELECT
  'ride', 'Default ride pre-pickup compensation', FALSE, 'FIXED', 30,
  0, 200, TRUE, 2, 'CUSTOMER_100', 100,
  jsonb_build_object('source', 'cancel_comp_seed_v1')
WHERE NOT EXISTS (
  SELECT 1 FROM service_cancellation_compensation_rules
  WHERE service_type = 'ride' AND metadata->>'source' = 'cancel_comp_seed_v1'
);

INSERT INTO service_cancellation_compensation_rules (
  service_type, name, is_active, calc_type, value_numeric,
  min_compensation, max_compensation, include_waiting_compensation,
  waiting_compensation_per_min, payer_mode, priority, metadata
)
SELECT
  'parcel', 'Default parcel pre-pickup compensation', FALSE, 'FIXED', 20,
  0, 150, TRUE, 1, 'CUSTOMER_100', 100,
  jsonb_build_object('source', 'cancel_comp_seed_v1')
WHERE NOT EXISTS (
  SELECT 1 FROM service_cancellation_compensation_rules
  WHERE service_type = 'parcel' AND metadata->>'source' = 'cancel_comp_seed_v1'
);

INSERT INTO service_cancellation_compensation_rules (
  service_type, name, is_active, calc_type, value_numeric,
  min_compensation, max_compensation, include_waiting_compensation,
  waiting_compensation_per_min, payer_mode, priority, metadata
)
SELECT
  'food', 'Default food pre-pickup compensation', FALSE, 'FIXED', 25,
  0, 150, TRUE, 1, 'CUSTOMER_100', 100,
  jsonb_build_object('source', 'cancel_comp_seed_v1')
WHERE NOT EXISTS (
  SELECT 1 FROM service_cancellation_compensation_rules
  WHERE service_type = 'food' AND metadata->>'source' = 'cancel_comp_seed_v1'
);
