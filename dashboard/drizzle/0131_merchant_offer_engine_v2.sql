-- ============================================================================
-- MERCHANT OFFER ENGINE V2 - Unified Offer, Mapping, Usage & Audit Schema
-- Database: Supabase PostgreSQL
-- Migration: 0131_merchant_offer_engine_v2
-- This migration is designed to be idempotent where possible.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUMS
-- ----------------------------------------------------------------------------

-- Use new enum names for the v2 offer engine to avoid conflicts with
-- any legacy enum definitions and to keep this migration safe in a
-- single transaction (no ALTER TYPE ADD VALUE needed).

DO $$ BEGIN
  CREATE TYPE merchant_offer_type AS ENUM (
    'PERCENTAGE_DISCOUNT',
    'FLAT_DISCOUNT',
    'COUPON_DISCOUNT',
    'BUY_N_GET_M',
    'FREE_ITEM',
    'FREE_DELIVERY',
    'COMBO_OFFER',
    'CASHBACK',
    'FIRST_ORDER_OFFER',
    'LOYALTY_BASED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE merchant_offer_status AS ENUM (
    'DRAFT',
    'ACTIVE',
    'INACTIVE',
    'EXPIRED',
    'ARCHIVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE merchant_offer_conflict_mode AS ENUM (
    'BEST_VALUE',
    'PRIORITY_BASED',
    'MERCHANT_CONTROLLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE merchant_offer_scope AS ENUM (
    'ITEM',
    'CATEGORY',
    'CART',
    'DELIVERY',
    'COMBO',
    'GLOBAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 2. CORE OFFERS TABLE
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS offers (
  id BIGSERIAL PRIMARY KEY,

  -- Ownership / scoping
  store_id BIGINT REFERENCES merchant_stores(id) ON DELETE CASCADE,

  -- Core definition
  type merchant_offer_type NOT NULL,
  subtype TEXT, -- e.g. ALL_ORDERS, SPECIFIC_ITEM, FIRST_ORDER_ONLY

  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  benefits JSONB NOT NULL DEFAULT '{}'::jsonb,

  priority INTEGER NOT NULL DEFAULT 100,
  stackable BOOLEAN NOT NULL DEFAULT FALSE,
  combinable_with TEXT[] NOT NULL DEFAULT '{}'::text[],
  max_offers_per_order INTEGER NOT NULL DEFAULT 2,

  usage_limit_total INTEGER,
  usage_limit_per_user INTEGER,

  valid_from TIMESTAMPTZ NOT NULL,
  valid_till TIMESTAMPTZ NOT NULL,

  status merchant_offer_status NOT NULL DEFAULT 'DRAFT',
  stacking_policy merchant_offer_conflict_mode NOT NULL DEFAULT 'MERCHANT_CONTROLLED',

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT,
  updated_by BIGINT
);

-- If an older offers table already exists without the new columns,
-- backfill the required columns so indexes and engine code work.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'offers'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'store_id'
    ) THEN
      ALTER TABLE offers ADD COLUMN store_id BIGINT REFERENCES merchant_stores(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'type'
    ) THEN
      ALTER TABLE offers ADD COLUMN type merchant_offer_type NOT NULL DEFAULT 'PERCENTAGE_DISCOUNT';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'subtype'
    ) THEN
      ALTER TABLE offers ADD COLUMN subtype TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'conditions'
    ) THEN
      ALTER TABLE offers ADD COLUMN conditions JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'benefits'
    ) THEN
      ALTER TABLE offers ADD COLUMN benefits JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'priority'
    ) THEN
      ALTER TABLE offers ADD COLUMN priority INTEGER NOT NULL DEFAULT 100;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'stackable'
    ) THEN
      ALTER TABLE offers ADD COLUMN stackable BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'combinable_with'
    ) THEN
      ALTER TABLE offers ADD COLUMN combinable_with TEXT[] NOT NULL DEFAULT '{}'::text[];
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'max_offers_per_order'
    ) THEN
      ALTER TABLE offers ADD COLUMN max_offers_per_order INTEGER NOT NULL DEFAULT 2;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'usage_limit_total'
    ) THEN
      ALTER TABLE offers ADD COLUMN usage_limit_total INTEGER;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'usage_limit_per_user'
    ) THEN
      ALTER TABLE offers ADD COLUMN usage_limit_per_user INTEGER;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'valid_from'
    ) THEN
      ALTER TABLE offers ADD COLUMN valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'valid_till'
    ) THEN
      ALTER TABLE offers ADD COLUMN valid_till TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'status'
    ) THEN
      ALTER TABLE offers ADD COLUMN status merchant_offer_status NOT NULL DEFAULT 'DRAFT';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'stacking_policy'
    ) THEN
      ALTER TABLE offers ADD COLUMN stacking_policy merchant_offer_conflict_mode NOT NULL DEFAULT 'MERCHANT_CONTROLLED';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'metadata'
    ) THEN
      ALTER TABLE offers ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'created_at'
    ) THEN
      ALTER TABLE offers ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'updated_at'
    ) THEN
      ALTER TABLE offers ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'created_by'
    ) THEN
      ALTER TABLE offers ADD COLUMN created_by BIGINT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'updated_by'
    ) THEN
      ALTER TABLE offers ADD COLUMN updated_by BIGINT;
    END IF;
  END IF;
END $$;

-- Indexes to speed up offer lookups
CREATE INDEX IF NOT EXISTS offers_store_status_time_idx
  ON offers (store_id, status, valid_from, valid_till)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS offers_type_idx
  ON offers (type);

CREATE INDEX IF NOT EXISTS offers_validity_idx
  ON offers (valid_from, valid_till);

-- Optional GIN index for conditions JSONB (filter by common keys like min_order_value)
CREATE INDEX IF NOT EXISTS offers_conditions_gin_idx
  ON offers USING GIN (conditions);

-- ----------------------------------------------------------------------------
-- 3. OFFER MAPPING TABLES (ITEM / CATEGORY / COMBO)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS offer_item_mappings (
  id BIGSERIAL PRIMARY KEY,
  offer_id BIGINT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  scope merchant_offer_scope NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS offer_item_mappings_offer_item_uniq
  ON offer_item_mappings (offer_id, item_id);

CREATE INDEX IF NOT EXISTS offer_item_mappings_item_idx
  ON offer_item_mappings (item_id);

CREATE TABLE IF NOT EXISTS offer_category_mappings (
  id BIGSERIAL PRIMARY KEY,
  offer_id BIGINT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS offer_category_mappings_offer_category_uniq
  ON offer_category_mappings (offer_id, category_id);

CREATE INDEX IF NOT EXISTS offer_category_mappings_category_idx
  ON offer_category_mappings (category_id);

CREATE TABLE IF NOT EXISTS offer_combo_mappings (
  id BIGSERIAL PRIMARY KEY,
  offer_id BIGINT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  combo_id BIGINT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS offer_combo_mappings_offer_combo_uniq
  ON offer_combo_mappings (offer_id, combo_id);

CREATE INDEX IF NOT EXISTS offer_combo_mappings_combo_idx
  ON offer_combo_mappings (combo_id);

-- ----------------------------------------------------------------------------
-- 4. COUPON TABLE (linked 1:1 with offers where applicable)
-- ----------------------------------------------------------------------------

-- Use text with functional index for case-insensitive code matching.
CREATE TABLE IF NOT EXISTS coupons (
  id BIGSERIAL PRIMARY KEY,
  offer_id BIGINT NOT NULL UNIQUE REFERENCES offers(id) ON DELETE CASCADE,

  code TEXT NOT NULL UNIQUE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  usage_limit_total INTEGER,
  usage_limit_per_user INTEGER,

  status merchant_offer_status NOT NULL DEFAULT 'ACTIVE',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive lookup: upper(code)
CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_upper_uniq
  ON coupons (UPPER(code));

-- ----------------------------------------------------------------------------
-- 5. OFFER USAGE & ORDER-LEVEL APPLICATION
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS offer_usages (
  id BIGSERIAL PRIMARY KEY,

  user_id BIGINT NOT NULL,
  offer_id BIGINT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  order_id BIGINT,

  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  amount_discounted NUMERIC(12, 2) NOT NULL,
  cashback_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,

  channel TEXT NOT NULL, -- 'merchant_app', 'partner_site', 'end_user_app', etc.
  usage_context JSONB NOT NULL, -- snapshot of cart, prices, etc.

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS offer_usages_user_offer_order_uniq
  ON offer_usages (user_id, offer_id, order_id);

CREATE INDEX IF NOT EXISTS offer_usages_user_offer_idx
  ON offer_usages (user_id, offer_id);

CREATE INDEX IF NOT EXISTS offer_usages_offer_idx
  ON offer_usages (offer_id);

CREATE INDEX IF NOT EXISTS offer_usages_order_idx
  ON offer_usages (order_id);

CREATE TABLE IF NOT EXISTS offer_order_applied (
  id BIGSERIAL PRIMARY KEY,

  order_id BIGINT NOT NULL,
  offer_id BIGINT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,

  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cashback_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,

  details JSONB NOT NULL, -- line-level breakdown from engine trace

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS offer_order_applied_order_idx
  ON offer_order_applied (order_id);

CREATE INDEX IF NOT EXISTS offer_order_applied_offer_idx
  ON offer_order_applied (offer_id);

-- ----------------------------------------------------------------------------
-- 6. OFFER AUDIT LOG
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS offer_audit_log (
  id BIGSERIAL PRIMARY KEY,

  action TEXT NOT NULL, -- CREATE, UPDATE, DELETE, ACTIVATE, DEACTIVATE, MIGRATED
  actor_type TEXT NOT NULL, -- 'merchant', 'agent', 'system'
  actor_id BIGINT,

  offer_id BIGINT REFERENCES offers(id) ON DELETE SET NULL,
  store_id BIGINT REFERENCES merchant_stores(id) ON DELETE SET NULL,

  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  changes JSONB NOT NULL, -- { before: {...}, after: {...} }
  source TEXT NOT NULL, -- 'merchant_app', 'dashboard', 'api', 'migration'

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS offer_audit_log_offer_idx
  ON offer_audit_log (offer_id, timestamp);

CREATE INDEX IF NOT EXISTS offer_audit_log_store_idx
  ON offer_audit_log (store_id, timestamp);

-- ----------------------------------------------------------------------------
-- 7. OPTIONAL: BASIC BACKFILL STUB (NO DATA MIGRATION YET)
-- ----------------------------------------------------------------------------

-- NOTE: Actual migration from existing merchant_offers or legacy tables
-- into offers/offer_item_mappings/offer_category_mappings should be done
-- in a dedicated, carefully tested script. This migration only creates
-- the new schema required by the unified offer engine.

-- END 0131_merchant_offer_engine_v2.sql

