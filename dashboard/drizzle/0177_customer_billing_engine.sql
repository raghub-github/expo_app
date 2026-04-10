-- Customer billing engine: tax bases, fee rule types, discount targeting, tax groups.
-- Allows multiple tax configs per service type (item + delivery + fees).
--
-- NOTE: New PostgreSQL enum values cannot be used in the same transaction as ALTER TYPE ... ADD VALUE.
-- Seed inserts using those values live in 0178_customer_billing_engine_seed.sql (run after this file).

DROP INDEX IF EXISTS billing_tax_configs_one_per_service_idx;

DO $$ BEGIN
  ALTER TYPE billing_tax_applicable_base ADD VALUE 'ITEM_AFTER_DISCOUNT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE billing_tax_applicable_base ADD VALUE 'PACKAGING_FEE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE billing_tax_applicable_base ADD VALUE 'SURGE_FEE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE billing_tax_applicable_base ADD VALUE 'SMALL_ORDER_FEE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE billing_tax_applicable_base ADD VALUE 'CONVENIENCE_FEE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE billing_rule_type ADD VALUE 'SMALL_ORDER_FEE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE billing_rule_type ADD VALUE 'CONVENIENCE_FEE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE billing_discount_applies_on AS ENUM (
    'ITEMS_TOTAL',
    'SUBTOTAL',
    'DELIVERY_FEE',
    'PLATFORM_FEE',
    'PACKAGING_FEE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE billing_tax_group AS ENUM (
    'item',
    'delivery',
    'platform',
    'packaging',
    'surge',
    'fee',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE billing_pricing_rules
  ADD COLUMN IF NOT EXISTS discount_applies_on billing_discount_applies_on NOT NULL DEFAULT 'ITEMS_TOTAL';

ALTER TABLE billing_pricing_rules
  ADD COLUMN IF NOT EXISTS charge_subtype text;

ALTER TABLE billing_tax_configs
  ADD COLUMN IF NOT EXISTS tax_group billing_tax_group;

COMMENT ON COLUMN billing_pricing_rules.discount_applies_on IS 'For DISCOUNT/OFFER: which base the discount reduces (engine pass order: charges then discounts).';
COMMENT ON COLUMN billing_tax_configs.tax_group IS 'UI/export grouping for GST lines (item vs delivery vs platform, etc.).';
