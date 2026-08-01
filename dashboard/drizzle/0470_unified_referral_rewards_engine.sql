-- =============================================================================
-- UNIFIED REFERRAL & REWARDS ENGINE (Customer + Rider)
-- Idempotent. Reuses existing wallet / notification / ledger tables.
-- Preserves legacy referral_offers / referrals / customer_referrals for
-- backward compatibility; data is migrated into the unified tables below.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ENUMS
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE referral_user_type AS ENUM ('customer', 'rider');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE referral_reward_type AS ENUM ('GATICASH', 'WALLET_CREDIT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE referral_relationship_status AS ENUM (
    'pending',
    'attributed',
    'first_order_pending',
    'milestone_pending',
    'reward_credited',
    'cap_reached',
    'ineligible',
    'fraud_blocked',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE referral_reward_tx_status AS ENUM (
    'pending',
    'credited',
    'skipped_disabled',
    'skipped_cap',
    'failed',
    'reversed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE referral_reward_party AS ENUM ('referrer', 'referred');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE referral_attribution_source AS ENUM (
    'deep_link',
    'play_install_referrer',
    'manual',
    'share_sheet',
    'legacy_migration',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 2. referral_settings (singleton-style global config; id=1)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT true,
  reward_enabled BOOLEAN NOT NULL DEFAULT true,
  customer_referral_enabled BOOLEAN NOT NULL DEFAULT true,
  rider_referral_enabled BOOLEAN NOT NULL DEFAULT true,
  customer_reward_enabled BOOLEAN NOT NULL DEFAULT true,
  rider_reward_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_apply_enabled BOOLEAN NOT NULL DEFAULT true,
  require_kyc BOOLEAN NOT NULL DEFAULT true,
  first_order_only BOOLEAN NOT NULL DEFAULT true,
  min_order_amount NUMERIC(12, 2) NOT NULL DEFAULT 249.00,
  monthly_reward_cap NUMERIC(12, 2) NOT NULL DEFAULT 1000.00,
  currency TEXT NOT NULL DEFAULT 'INR',
  eligible_services TEXT[] NOT NULL DEFAULT ARRAY['food','parcel','grocery']::TEXT[],
  fraud_checks JSONB NOT NULL DEFAULT '{
    "block_self_referral": true,
    "block_same_phone": true,
    "block_same_device": true,
    "block_duplicate_reward": true,
    "require_delivered_status": true,
    "block_cancelled": true,
    "block_refunded": true,
    "block_returned": true
  }'::jsonb,
  deep_link JSONB NOT NULL DEFAULT '{
    "customer_path_prefix": "/ref",
    "customer_invite_prefix": "/invite",
    "rider_path_prefix": "/rider-ref",
    "play_store_customer_package": "com.gatimitra.customer",
    "play_store_rider_package": "com.gatimitra.rider",
    "referrer_prefix": "ref_"
  }'::jsonb,
  notification_templates JSONB NOT NULL DEFAULT '{
    "customer_reward": {
      "title": "Referral Reward Received",
      "body": "₹{{amount}} GatiCash has been credited to your GatiCash wallet. Use it on your next GatiMitra order."
    },
    "customer_referrer": {
      "title": "Referral Successful",
      "body": "Your friend completed their first order. ₹{{amount}} GatiCash has been credited."
    },
    "rider_milestone": {
      "title": "Referral Milestone Achieved",
      "body": "₹{{amount}} has been credited to your Rider Wallet. You can withdraw this amount with your next withdrawal request."
    }
  }'::jsonb,
  config_version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE referral_settings IS 'Global referral engine configuration. Super Admin controlled. config_version bumps on every change for realtime sync.';

INSERT INTO referral_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. referral_reward_rules (customer first-order + unlimited rider milestones)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_reward_rules (
  id BIGSERIAL PRIMARY KEY,
  user_type referral_user_type NOT NULL,
  rule_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  -- Customer: typically milestone_orders = 1 (first delivered order)
  -- Rider: milestone_orders = 20 / 50 / 100 / ...
  milestone_orders INT NOT NULL DEFAULT 1 CHECK (milestone_orders >= 0),
  reward_amount NUMERIC(12, 2) NOT NULL CHECK (reward_amount >= 0),
  reward_type referral_reward_type NOT NULL,
  reward_party referral_reward_party NOT NULL DEFAULT 'referrer',
  -- When true, referred user also gets this amount (customer both-sides default)
  also_credit_referred BOOLEAN NOT NULL DEFAULT false,
  referred_reward_amount NUMERIC(12, 2),
  require_kyc BOOLEAN,
  min_order_amount NUMERIC(12, 2),
  active BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 100,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referral_reward_rules_type_check CHECK (
    (user_type = 'customer' AND reward_type = 'GATICASH')
    OR (user_type = 'rider' AND reward_type = 'WALLET_CREDIT')
  ),
  CONSTRAINT referral_reward_rules_code_unique UNIQUE (rule_code)
);

CREATE INDEX IF NOT EXISTS referral_reward_rules_user_type_active_idx
  ON referral_reward_rules (user_type, active, priority, milestone_orders);

COMMENT ON TABLE referral_reward_rules IS 'Configurable reward rules. Customer = GATICASH only. Rider = WALLET_CREDIT only. Unlimited rider milestones.';

-- Default customer rule (both sides ₹50) — amounts are DB-driven defaults only
INSERT INTO referral_reward_rules (
  user_type, rule_code, name, description, milestone_orders,
  reward_amount, reward_type, reward_party, also_credit_referred,
  referred_reward_amount, active, priority
)
SELECT
  'customer', 'CUSTOMER_FIRST_ORDER', 'Customer first delivered order',
  'Referrer and referred both earn GatiCash after first delivered order meeting min amount',
  1, 50.00, 'GATICASH', 'referrer', true, 50.00, true, 10
WHERE NOT EXISTS (
  SELECT 1 FROM referral_reward_rules WHERE rule_code = 'CUSTOMER_FIRST_ORDER'
);

-- Default rider milestones
INSERT INTO referral_reward_rules (
  user_type, rule_code, name, description, milestone_orders,
  reward_amount, reward_type, reward_party, also_credit_referred, require_kyc, active, priority
)
SELECT v.user_type, v.rule_code, v.name, v.description, v.milestone_orders,
       v.reward_amount, v.reward_type::referral_reward_type, v.reward_party::referral_reward_party,
       false, true, true, v.priority
FROM (VALUES
  ('rider'::referral_user_type, 'RIDER_M20', '20 completed orders', 'KYC approved + 20 completed orders', 20, 300.00, 'WALLET_CREDIT', 'referrer', 10),
  ('rider'::referral_user_type, 'RIDER_M50', '50 completed orders', '50 completed orders', 50, 500.00, 'WALLET_CREDIT', 'referrer', 20),
  ('rider'::referral_user_type, 'RIDER_M100', '100 completed orders', '100 completed orders', 100, 1000.00, 'WALLET_CREDIT', 'referrer', 30)
) AS v(user_type, rule_code, name, description, milestone_orders, reward_amount, reward_type, reward_party, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM referral_reward_rules r WHERE r.rule_code = v.rule_code
);

-- -----------------------------------------------------------------------------
-- 4. referral_codes (unified lookup; syncs from customers/riders)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_codes (
  id BIGSERIAL PRIMARY KEY,
  user_type referral_user_type NOT NULL,
  user_id BIGINT NOT NULL,
  referral_code TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referral_codes_code_unique UNIQUE (referral_code),
  CONSTRAINT referral_codes_user_unique UNIQUE (user_type, user_id)
);

CREATE INDEX IF NOT EXISTS referral_codes_user_idx ON referral_codes (user_type, user_id);
CREATE INDEX IF NOT EXISTS referral_codes_active_idx ON referral_codes (active) WHERE active = true;

-- Backfill from customers
INSERT INTO referral_codes (user_type, user_id, referral_code, active)
SELECT 'customer', c.id, UPPER(TRIM(c.referral_code)), true
FROM customers c
WHERE c.referral_code IS NOT NULL AND TRIM(c.referral_code) <> ''
ON CONFLICT (referral_code) DO NOTHING;

-- Backfill from riders
INSERT INTO referral_codes (user_type, user_id, referral_code, active)
SELECT 'rider', r.id::bigint, UPPER(TRIM(r.referral_code)), true
FROM riders r
WHERE r.referral_code IS NOT NULL AND TRIM(r.referral_code) <> ''
ON CONFLICT (referral_code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. referral_relationships (unified mapping)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_relationships (
  id BIGSERIAL PRIMARY KEY,
  user_type referral_user_type NOT NULL,
  referrer_id BIGINT NOT NULL,
  referred_user_id BIGINT NOT NULL,
  referral_code TEXT NOT NULL,
  source referral_attribution_source NOT NULL DEFAULT 'unknown',
  install_at TIMESTAMPTZ,
  app_open_at TIMESTAMPTZ,
  auto_applied BOOLEAN NOT NULL DEFAULT false,
  status referral_relationship_status NOT NULL DEFAULT 'pending',
  reward_status TEXT NOT NULL DEFAULT 'pending',
  completed_orders INT NOT NULL DEFAULT 0,
  kyc_approved BOOLEAN NOT NULL DEFAULT false,
  qualifying_order_id BIGINT,
  qualifying_order_amount NUMERIC(12, 2),
  device_fingerprint TEXT,
  phone_hash TEXT,
  fraud_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Legacy bridges (nullable; keep old UIs working)
  legacy_rider_referral_id BIGINT,
  legacy_customer_referral_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referral_relationships_referred_unique UNIQUE (user_type, referred_user_id),
  CONSTRAINT referral_relationships_no_self CHECK (referrer_id <> referred_user_id)
);

CREATE INDEX IF NOT EXISTS referral_relationships_referrer_idx
  ON referral_relationships (user_type, referrer_id);
CREATE INDEX IF NOT EXISTS referral_relationships_status_idx
  ON referral_relationships (status);
CREATE INDEX IF NOT EXISTS referral_relationships_code_idx
  ON referral_relationships (referral_code);

-- Migrate rider referrals
INSERT INTO referral_relationships (
  user_type, referrer_id, referred_user_id, referral_code, source,
  auto_applied, status, reward_status, metadata, legacy_rider_referral_id, created_at
)
SELECT
  'rider',
  r.referrer_id::bigint,
  r.referred_id::bigint,
  COALESCE(NULLIF(UPPER(TRIM(r.referral_code_used)), ''), COALESCE(rr.referral_code, 'LEGACY')),
  'legacy_migration'::referral_attribution_source,
  true,
  CASE
    WHEN COALESCE(r.referrer_reward_paid, false) THEN 'reward_credited'::referral_relationship_status
    ELSE 'milestone_pending'::referral_relationship_status
  END,
  CASE WHEN COALESCE(r.referrer_reward_paid, false) THEN 'credited' ELSE 'pending' END,
  COALESCE(r.metadata, '{}'::jsonb) || jsonb_build_object('migrated_from', 'referrals'),
  r.id,
  r.created_at
FROM referrals r
LEFT JOIN riders rr ON rr.id = r.referrer_id
ON CONFLICT (user_type, referred_user_id) DO NOTHING;

-- Migrate customer_referrals if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customer_referrals'
  ) THEN
    INSERT INTO referral_relationships (
      user_type, referrer_id, referred_user_id, referral_code, source,
      auto_applied, status, reward_status, completed_orders,
      metadata, legacy_customer_referral_id, created_at, updated_at
    )
    SELECT
      'customer',
      cr.referrer_customer_id,
      cr.referred_customer_id,
      UPPER(TRIM(cr.referral_code)),
      'legacy_migration'::referral_attribution_source,
      true,
      CASE
        WHEN UPPER(COALESCE(cr.referral_status, '')) = 'COMPLETED' THEN 'reward_credited'::referral_relationship_status
        WHEN UPPER(COALESCE(cr.referral_status, '')) = 'EXPIRED' THEN 'cancelled'::referral_relationship_status
        ELSE 'first_order_pending'::referral_relationship_status
      END,
      CASE
        WHEN COALESCE(cr.referrer_reward_given, false) THEN 'credited'
        ELSE 'pending'
      END,
      COALESCE(cr.completed_orders, 0),
      jsonb_build_object('migrated_from', 'customer_referrals'),
      cr.id,
      cr.created_at,
      COALESCE(cr.updated_at, cr.created_at)
    FROM customer_referrals cr
    ON CONFLICT (user_type, referred_user_id) DO NOTHING;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 6. referral_reward_transactions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_reward_transactions (
  id BIGSERIAL PRIMARY KEY,
  referral_relationship_id BIGINT NOT NULL REFERENCES referral_relationships(id) ON DELETE CASCADE,
  reward_rule_id BIGINT REFERENCES referral_reward_rules(id) ON DELETE SET NULL,
  user_type referral_user_type NOT NULL,
  beneficiary_user_id BIGINT NOT NULL,
  reward_party referral_reward_party NOT NULL,
  reward_amount NUMERIC(12, 2) NOT NULL,
  reward_type referral_reward_type NOT NULL,
  status referral_reward_tx_status NOT NULL DEFAULT 'pending',
  wallet_transaction_id BIGINT,
  wallet_ledger_id BIGINT,
  idempotency_key TEXT NOT NULL,
  milestone_orders INT,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  credited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referral_reward_tx_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS referral_reward_tx_relationship_idx
  ON referral_reward_transactions (referral_relationship_id);
CREATE INDEX IF NOT EXISTS referral_reward_tx_beneficiary_idx
  ON referral_reward_transactions (user_type, beneficiary_user_id);
CREATE INDEX IF NOT EXISTS referral_reward_tx_status_idx
  ON referral_reward_transactions (status);

-- -----------------------------------------------------------------------------
-- 7. referral_monthly_usage (cap tracking per referrer)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_monthly_usage (
  id BIGSERIAL PRIMARY KEY,
  user_type referral_user_type NOT NULL,
  user_id BIGINT NOT NULL,
  month CHAR(7) NOT NULL, -- YYYY-MM
  total_rewards NUMERIC(12, 2) NOT NULL DEFAULT 0,
  reward_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referral_monthly_usage_unique UNIQUE (user_type, user_id, month)
);

CREATE INDEX IF NOT EXISTS referral_monthly_usage_month_idx ON referral_monthly_usage (month);

-- -----------------------------------------------------------------------------
-- 8. referral_configuration_audit
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_configuration_audit (
  id BIGSERIAL PRIMARY KEY,
  admin_id BIGINT,
  admin_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_configuration_audit_created_idx
  ON referral_configuration_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS referral_configuration_audit_admin_idx
  ON referral_configuration_audit (admin_id);

-- -----------------------------------------------------------------------------
-- 9. referral_install_clicks (deferred deep-link attribution)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_install_clicks (
  id BIGSERIAL PRIMARY KEY,
  referral_code TEXT NOT NULL,
  user_type referral_user_type NOT NULL,
  click_token TEXT NOT NULL UNIQUE,
  play_referrer TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  device_hint TEXT,
  consumed BOOLEAN NOT NULL DEFAULT false,
  consumed_at TIMESTAMPTZ,
  consumed_by_user_id BIGINT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_install_clicks_code_idx ON referral_install_clicks (referral_code);
CREATE INDEX IF NOT EXISTS referral_install_clicks_open_idx
  ON referral_install_clicks (consumed, expires_at) WHERE consumed = false;

-- -----------------------------------------------------------------------------
-- 10. Migrate active rider offers → milestone rules (best-effort)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  offer RECORD;
  v_rule_code TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'referral_offers'
  ) THEN
    FOR offer IN
      SELECT *
      FROM referral_offers
      WHERE is_active = true
        AND COALESCE(min_orders_per_referred, 0) > 0
        AND COALESCE(amount, 0) > 0
    LOOP
      v_rule_code := 'LEGACY_OFFER_' || offer.offer_code;
      INSERT INTO referral_reward_rules (
        user_type, rule_code, name, description, milestone_orders,
        reward_amount, reward_type, reward_party, require_kyc, active, priority, metadata
      )
      VALUES (
        'rider',
        v_rule_code,
        offer.name,
        COALESCE(offer.description, offer.terms_and_conditions),
        offer.min_orders_per_referred,
        offer.amount,
        'WALLET_CREDIT',
        'referrer',
        true,
        offer.is_active,
        50,
        jsonb_build_object(
          'migrated_from', 'referral_offers',
          'legacy_offer_id', offer.id,
          'offer_code', offer.offer_code
        )
      )
      ON CONFLICT (rule_code) DO NOTHING;
    END LOOP;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 11. Bump helper for realtime config sync
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bump_referral_config_version()
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v BIGINT;
BEGIN
  UPDATE referral_settings
  SET config_version = config_version + 1,
      updated_at = NOW()
  WHERE id = 1
  RETURNING config_version INTO v;
  RETURN COALESCE(v, 1);
END;
$$;

COMMENT ON FUNCTION bump_referral_config_version IS 'Increments referral_settings.config_version so apps can invalidate caches / sync live.';

-- -----------------------------------------------------------------------------
-- 12. Notification templates for referral rewards
-- -----------------------------------------------------------------------------
INSERT INTO public.notification_templates
  (code, category, role, channel, title_template, body_template, deep_link, priority, variables_schema)
VALUES
  ('REFERRAL_REWARD_CUSTOMER', 'wallet', 'customer', 'all',
   '{{title}}', '{{body}}', '/profile/referrals', 'high',
   '{"title":"string","body":"string","amount":"number"}'::jsonb),
  ('REFERRAL_REWARD_RIDER', 'wallet', 'rider', 'all',
   '{{title}}', '{{body}}', '/profile', 'high',
   '{"title":"string","body":"string","amount":"number"}'::jsonb)
ON CONFLICT (code, locale) DO NOTHING;
