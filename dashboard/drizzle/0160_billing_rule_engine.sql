-- Rule-based billing: pricing rules, conditions, slabs, tax configs, coupons, merchant overrides, ruleset version.
-- Also extends pending_orders with authoritative billing snapshot + optional coupon.
--
-- Safe to re-run on Postgres: enums/tables/indexes use IF NOT EXISTS / duplicate_object guards.
-- If you already applied a non-idempotent 0160 once, this file may no-op for existing objects.

-- ---------- ENUMs (skip if already created) ----------
DO $enum$ BEGIN
  CREATE TYPE billing_rule_type AS ENUM (
    'DISCOUNT', 'OFFER', 'DELIVERY', 'PLATFORM_FEE', 'TAX', 'PACKAGING', 'SURGE', 'FEE', 'SUBSCRIPTION', 'DONATION', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

ALTER TYPE billing_rule_type ADD VALUE IF NOT EXISTS 'OFFER';
ALTER TYPE billing_rule_type ADD VALUE IF NOT EXISTS 'OTHER';
ALTER TYPE billing_rule_type ADD VALUE IF NOT EXISTS 'SUBSCRIPTION';
ALTER TYPE billing_rule_type ADD VALUE IF NOT EXISTS 'DONATION';

DO $enum$ BEGIN
  CREATE TYPE billing_calculation_type AS ENUM ('FIXED', 'PERCENTAGE', 'FORMULA_KEY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE billing_applies_to AS ENUM ('ORDER', 'ITEM', 'DELIVERY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE billing_condition_type AS ENUM (
    'ORDER_VALUE', 'DISTANCE_KM', 'TIME_WINDOW', 'MERCHANT_ID',
    'MERCHANT_STORE_ID', 'ITEM_CATEGORY', 'USER_TYPE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE billing_condition_operator AS ENUM (
    'GT', 'GTE', 'LT', 'LTE', 'EQ', 'NEQ', 'BETWEEN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE billing_tax_applicable_base AS ENUM (
    'ITEM_SUBTOTAL', 'AFTER_DISCOUNTS', 'DELIVERY_FEE', 'PLATFORM_FEE', 'GRAND_BEFORE_TAX'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE billing_discount_type AS ENUM ('FIXED', 'PERCENTAGE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE billing_offer_owner AS ENUM ('GATIMITRA', 'MERCHANT', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

-- ---------- Core tables ----------
CREATE TABLE IF NOT EXISTS billing_ruleset_version (
  id integer PRIMARY KEY CHECK (id = 1),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO billing_ruleset_version (id, version) VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS billing_pricing_rules (
  id bigserial PRIMARY KEY,
  name text,
  type billing_rule_type NOT NULL,
  calculation_type billing_calculation_type NOT NULL,
  value_numeric numeric(14, 4),
  value_json jsonb,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  stackable boolean NOT NULL DEFAULT true,
  applies_to billing_applies_to NOT NULL DEFAULT 'ORDER',
  offer_owner billing_offer_owner NOT NULL DEFAULT 'GATIMITRA',
  is_hidden boolean NOT NULL DEFAULT false,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE billing_pricing_rules
  ADD COLUMN IF NOT EXISTS offer_owner billing_offer_owner NOT NULL DEFAULT 'GATIMITRA',
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS billing_pricing_rules_active_priority_idx
  ON billing_pricing_rules (is_active, priority);
CREATE INDEX IF NOT EXISTS billing_pricing_rules_type_active_idx
  ON billing_pricing_rules (type, is_active);

CREATE TABLE IF NOT EXISTS billing_pricing_rule_conditions (
  id bigserial PRIMARY KEY,
  rule_id bigint NOT NULL REFERENCES billing_pricing_rules (id) ON DELETE CASCADE,
  condition_type billing_condition_type NOT NULL,
  operator billing_condition_operator NOT NULL,
  value_min numeric(14, 4),
  value_max numeric(14, 4),
  value_text text,
  value_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_pricing_rule_conditions_rule_id_idx
  ON billing_pricing_rule_conditions (rule_id);

CREATE TABLE IF NOT EXISTS billing_delivery_slabs (
  id bigserial PRIMARY KEY,
  name text,
  min_km numeric(10, 2),
  max_km numeric(10, 2),
  fee_fixed numeric(14, 4) NOT NULL DEFAULT 0,
  fee_per_km numeric(14, 4) NOT NULL DEFAULT 0,
  scope_type text NOT NULL DEFAULT 'global',
  scope_id bigint,
  metadata jsonb,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_delivery_slabs_scope_active_priority_idx
  ON billing_delivery_slabs (scope_type, scope_id, is_active, priority);

CREATE TABLE IF NOT EXISTS billing_tax_configs (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  rate numeric(10, 6) NOT NULL,
  applicable_base billing_tax_applicable_base NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_hidden boolean NOT NULL DEFAULT false,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE billing_tax_configs
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS billing_tax_configs_active_priority_idx
  ON billing_tax_configs (is_active, priority);

CREATE TABLE IF NOT EXISTS billing_discounts (
  id bigserial PRIMARY KEY,
  code text NOT NULL,
  discount_type billing_discount_type NOT NULL,
  value_numeric numeric(14, 4),
  max_discount_cap numeric(14, 4),
  usage_limit integer,
  used_count integer NOT NULL DEFAULT 0,
  valid_from timestamptz,
  valid_until timestamptz,
  pricing_rule_id bigint REFERENCES billing_pricing_rules (id) ON DELETE SET NULL,
  metadata jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE billing_discounts
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS billing_discounts_code_lower_idx
  ON billing_discounts (lower(code));

CREATE TABLE IF NOT EXISTS merchant_billing_overrides (
  id bigserial PRIMARY KEY,
  merchant_store_id bigint NOT NULL UNIQUE,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pending_orders
  ADD COLUMN IF NOT EXISTS billing_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS billing_ruleset_version integer,
  ADD COLUMN IF NOT EXISTS coupon_code text;

