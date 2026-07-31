-- 0466: Ride component engines — waiting funding/max, night configs, toll history,
-- per-component GST applicability bases for RIDE.
-- Idempotent. Enum ADD VALUE in separate DO blocks (PG restriction).

-- ---------------------------------------------------------------------------
-- Tax applicable bases for ride components (seeded inactive / rate 0 for toll)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE billing_tax_applicable_base ADD VALUE 'WAITING_FEE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE billing_tax_applicable_base ADD VALUE 'NIGHT_FEE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE billing_tax_applicable_base ADD VALUE 'TOLL_FEE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE billing_tax_applicable_base ADD VALUE 'SERVICE_FEE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE billing_tax_group ADD VALUE 'waiting';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE billing_tax_group ADD VALUE 'night';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE billing_tax_group ADD VALUE 'toll';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE billing_tax_group ADD VALUE 'service';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- service_payout_rules — waiting max + Customer/Company/Shared funding
-- ---------------------------------------------------------------------------
ALTER TABLE service_payout_rules
  ADD COLUMN IF NOT EXISTS waiting_max_charge numeric(14, 2),
  ADD COLUMN IF NOT EXISTS waiting_funding_mode text NOT NULL DEFAULT 'CUSTOMER_100',
  ADD COLUMN IF NOT EXISTS waiting_customer_share_pct numeric(6, 3) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS waiting_company_share_pct numeric(6, 3) NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE service_payout_rules
    ADD CONSTRAINT service_payout_rules_waiting_funding_chk
    CHECK (waiting_funding_mode IN ('CUSTOMER_100', 'COMPANY_100', 'SHARED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN service_payout_rules.waiting_max_charge IS
  'Optional ceiling on customer waiting charge (₹). NULL = uncapped.';
COMMENT ON COLUMN service_payout_rules.waiting_funding_mode IS
  'Who pays waiting: CUSTOMER_100 | COMPANY_100 | SHARED.';

-- ---------------------------------------------------------------------------
-- ride_night_configs — geo-scoped night charge windows
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ride_night_configs (
  id                    bigserial PRIMARY KEY,
  geo_level             text NOT NULL CHECK (geo_level IN ('country', 'state', 'city', 'locality', 'pincode')),
  geo_ref_id            text NOT NULL,
  name                  text NOT NULL DEFAULT 'Night charge',
  is_active             boolean NOT NULL DEFAULT FALSE,
  start_time            time NOT NULL DEFAULT '22:00',
  end_time              time NOT NULL DEFAULT '06:00',
  calc_type             text NOT NULL DEFAULT 'FIXED'
                        CHECK (calc_type IN ('FIXED', 'PER_KM', 'PERCENTAGE')),
  value_numeric         numeric(14, 4) NOT NULL DEFAULT 0,
  funding_mode          text NOT NULL DEFAULT 'CUSTOMER_100'
                        CHECK (funding_mode IN ('CUSTOMER_100', 'COMPANY_100', 'SHARED')),
  customer_share_pct    numeric(6, 3) NOT NULL DEFAULT 100,
  company_share_pct     numeric(6, 3) NOT NULL DEFAULT 0,
  priority              int NOT NULL DEFAULT 100,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT NOW(),
  updated_at            timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ride_night_configs_geo_idx
  ON ride_night_configs (geo_level, geo_ref_id)
  WHERE is_active = TRUE;

COMMENT ON TABLE ride_night_configs IS
  'Configurable night charge windows per geo. Inactive by default until Super Admin enables.';

-- ---------------------------------------------------------------------------
-- ride_toll_events — complete toll history per ride
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ride_toll_events (
  id                    bigserial PRIMARY KEY,
  order_core_id         bigint NOT NULL REFERENCES orders_core(id) ON DELETE CASCADE,
  rider_id              integer,
  amount                numeric(14, 2) NOT NULL CHECK (amount >= 0),
  currency              text NOT NULL DEFAULT 'INR',
  paid_by_rider         boolean NOT NULL DEFAULT TRUE,
  lat                   double precision,
  lng                   double precision,
  note                  text,
  proof_url             text,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ride_toll_events_order_idx
  ON ride_toll_events (order_core_id, created_at DESC);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'riders')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'ride_toll_events_rider_id_fkey'
     ) THEN
    ALTER TABLE ride_toll_events
      ADD CONSTRAINT ride_toll_events_rider_id_fkey
      FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON TABLE ride_toll_events IS
  'Append-only toll history. Amounts pass through to rider; no commission by default.';

-- ---------------------------------------------------------------------------
-- ride_wallet_config — commission_on_toll feature flag (default false)
-- ---------------------------------------------------------------------------
ALTER TABLE ride_wallet_config
  ADD COLUMN IF NOT EXISTS commission_on_toll boolean NOT NULL DEFAULT FALSE;

ALTER TABLE ride_wallet_config_history
  ADD COLUMN IF NOT EXISTS commission_on_toll boolean NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN ride_wallet_config.commission_on_toll IS
  'When true, toll is treated as a company charge subject to commission. Default false = rider pass-through.';
