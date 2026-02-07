-- =============================================================================
-- REFERRAL OFFERS & FULFILLMENTS
-- Run this in PostgreSQL (Supabase) SQL editor. Idempotent where possible.
-- Creates: referral_offer_type enum, referral_fulfillment_status enum,
--          referral_offers table, extends referrals, referral_fulfillments table.
-- T&C and amount/offer creation UI will be built later in super admin dashboard.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ENUMS
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE referral_offer_type AS ENUM (
    'fixed_per_referral',   -- Fixed amount per referred rider who qualifies
    'per_order_bonus',      -- Amount per order completed by referred rider
    'tiered',               -- Tiered: e.g. first 5 riders 100, next 10 50
    'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE referral_fulfillment_status AS ENUM (
    'pending',    -- Not yet met criteria
    'fulfilled',  -- Criteria met, not yet credited
    'credited',  -- Amount credited to referrer wallet
    'expired',   -- Offer expired before fulfillment
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 2. REFERRAL_OFFERS (offer definition; T&C and amounts set in super admin later)
-- Designed so logic can be customised later: city-wise T&C, amount, order count, limits.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_offers (
  id BIGSERIAL PRIMARY KEY,
  offer_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  offer_type referral_offer_type NOT NULL DEFAULT 'fixed_per_referral',
  amount NUMERIC(10, 2),                    -- Default amount (overridable per city in referral_offer_city_rules)
  amount_config JSONB NOT NULL DEFAULT '{}', -- Tiered: [{ "min_referrals": 0, "max_referrals": 5, "amount": 100 }, ...]
  service_types TEXT[] DEFAULT '{}',        -- ['food','parcel','person_ride'] or {} = all
  min_orders_per_referred INT NOT NULL DEFAULT 0,  -- Default min orders to qualify (overridable per city)
  min_referred_count INT NOT NULL DEFAULT 1,       -- For tiered: refer this many to get bonus
  max_referrals_per_referrer INT,          -- Global cap: max referrals per referrer for this offer (NULL = no limit)
  terms_and_conditions TEXT,               -- Default T&C (overridable per city)
  terms_snapshot JSONB DEFAULT '{}',       -- Structured T&C (overridable per city)
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  city_ids BIGINT[],                       -- NULL or {} = all cities; else offer applies only to these cities
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE referral_offers IS 'Referral campaign/offer definitions. Default T&C, amount, order count, limits; city-wise overrides in referral_offer_city_rules.';

CREATE INDEX IF NOT EXISTS referral_offers_offer_code_idx ON referral_offers(offer_code);
CREATE INDEX IF NOT EXISTS referral_offers_is_active_idx ON referral_offers(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS referral_offers_valid_idx ON referral_offers(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS referral_offers_offer_type_idx ON referral_offers(offer_type);

-- -----------------------------------------------------------------------------
-- 2b. REFERRAL_OFFER_CITY_RULES (city-wise overrides: amount, min orders, limit, T&C)
-- Use when one offer has different rules per city. Resolve: city_rules for (offer_id, city_id) else offer defaults.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_offer_city_rules (
  id BIGSERIAL PRIMARY KEY,
  offer_id BIGINT NOT NULL REFERENCES referral_offers(id) ON DELETE CASCADE,
  city_id BIGINT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2),                   -- Override offer amount for this city (NULL = use offer default)
  min_orders_per_referred INT,             -- Override min orders for this city (NULL = use offer default)
  max_referrals_per_referrer INT,          -- Cap per referrer in this city (NULL = use offer default or no limit)
  terms_and_conditions TEXT,               -- Override T&C for this city (NULL = use offer default)
  terms_snapshot JSONB DEFAULT '{}',       -- Override structured T&C for this city
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(offer_id, city_id)
);

COMMENT ON TABLE referral_offer_city_rules IS 'City-wise overrides for referral offers: amount, min_orders, max_referrals limit, T&C. Enables custom logic per city.';

CREATE INDEX IF NOT EXISTS referral_offer_city_rules_offer_id_idx ON referral_offer_city_rules(offer_id);
CREATE INDEX IF NOT EXISTS referral_offer_city_rules_city_id_idx ON referral_offer_city_rules(city_id);
CREATE UNIQUE INDEX IF NOT EXISTS referral_offer_city_rules_offer_city_idx ON referral_offer_city_rules(offer_id, city_id);

-- Add max_referrals_per_referrer to referral_offers if already applied without it
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'referral_offers' AND column_name = 'max_referrals_per_referrer') THEN
    ALTER TABLE referral_offers ADD COLUMN max_referrals_per_referrer INT;
    COMMENT ON COLUMN referral_offers.max_referrals_per_referrer IS 'Global cap: max referrals per referrer for this offer (NULL = no limit).';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. EXTEND REFERRALS (link to offer, code used, city at signup)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'offer_id') THEN
    ALTER TABLE referrals ADD COLUMN offer_id BIGINT REFERENCES referral_offers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'referral_code_used') THEN
    ALTER TABLE referrals ADD COLUMN referral_code_used TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'referred_city_id') THEN
    ALTER TABLE referrals ADD COLUMN referred_city_id BIGINT REFERENCES cities(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'referred_city_name') THEN
    ALTER TABLE referrals ADD COLUMN referred_city_name TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS referrals_offer_id_idx ON referrals(offer_id) WHERE offer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS referrals_referred_city_id_idx ON referrals(referred_city_id) WHERE referred_city_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. REFERRAL_FULFILLMENTS (per referral: order counts, amount credited, status, T&C snapshot)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_fulfillments (
  id BIGSERIAL PRIMARY KEY,
  referral_id BIGINT NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  offer_id BIGINT NOT NULL REFERENCES referral_offers(id) ON DELETE RESTRICT,
  referrer_rider_id INT NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  referred_rider_id INT NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  status referral_fulfillment_status NOT NULL DEFAULT 'pending',
  min_orders_required INT NOT NULL DEFAULT 0,   -- Snapshot from offer
  orders_completed_by_referred INT NOT NULL DEFAULT 0,
  orders_completed_food INT NOT NULL DEFAULT 0,
  orders_completed_parcel INT NOT NULL DEFAULT 0,
  orders_completed_person_ride INT NOT NULL DEFAULT 0,
  amount_credited NUMERIC(10, 2) NOT NULL DEFAULT 0,
  amount_credited_food NUMERIC(10, 2) NOT NULL DEFAULT 0,
  amount_credited_parcel NUMERIC(10, 2) NOT NULL DEFAULT 0,
  amount_credited_person_ride NUMERIC(10, 2) NOT NULL DEFAULT 0,
  wallet_ledger_id BIGINT,                     -- FK to wallet_ledger when credited (optional)
  credited_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  city_id BIGINT REFERENCES cities(id) ON DELETE SET NULL,
  city_name TEXT,
  terms_snapshot JSONB DEFAULT '{}',           -- T&C at time of offer
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(referral_id)
);

COMMENT ON TABLE referral_fulfillments IS 'Per-referral fulfillment: order counts, amount credited to referrer, status. One row per referral.';

CREATE INDEX IF NOT EXISTS referral_fulfillments_referrer_rider_id_idx ON referral_fulfillments(referrer_rider_id);
CREATE INDEX IF NOT EXISTS referral_fulfillments_referred_rider_id_idx ON referral_fulfillments(referred_rider_id);
CREATE INDEX IF NOT EXISTS referral_fulfillments_offer_id_idx ON referral_fulfillments(offer_id);
CREATE INDEX IF NOT EXISTS referral_fulfillments_status_idx ON referral_fulfillments(status);
CREATE INDEX IF NOT EXISTS referral_fulfillments_fulfilled_at_idx ON referral_fulfillments(fulfilled_at) WHERE fulfilled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS referral_fulfillments_credited_at_idx ON referral_fulfillments(credited_at) WHERE credited_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS referral_fulfillments_city_id_idx ON referral_fulfillments(city_id) WHERE city_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5. SEED ONE PLACEHOLDER OFFER (optional; can be removed or edited)
-- -----------------------------------------------------------------------------
INSERT INTO referral_offers (offer_code, name, description, offer_type, amount, min_orders_per_referred, terms_and_conditions, is_active)
SELECT 'REFER_DEFAULT', 'Default Referral Offer', 'Refer a rider; reward when referred rider completes minimum orders.', 'fixed_per_referral', 100.00, 10, 'Terms to be configured in super admin dashboard.', true
WHERE NOT EXISTS (SELECT 1 FROM referral_offers WHERE offer_code = 'REFER_DEFAULT');

-- -----------------------------------------------------------------------------
-- END 0087_referral_offers_and_fulfillments.sql
-- -----------------------------------------------------------------------------
