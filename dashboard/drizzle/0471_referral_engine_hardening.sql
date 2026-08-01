-- =============================================================================
-- 0471 — Referral engine hardening: lifecycle, campaigns, queue, expiry, codes
-- Depends on 0470_unified_referral_rewards_engine.sql
-- Idempotent. Legacy tables preserved.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Lifecycle state machine enum + event log
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE referral_lifecycle_state AS ENUM (
    'LINK_SHARED',
    'LINK_CLICKED',
    'PLAY_STORE_OPENED',
    'APP_INSTALLED',
    'FIRST_APP_OPEN',
    'REFERRAL_APPLIED',
    'FIRST_ORDER_PLACED',
    'ORDER_DELIVERED',
    'REWARD_ELIGIBLE',
    'REWARD_GRANTED',
    'REWARD_NOTIFIED',
    'REWARD_FAILED',
    'FRAUD_BLOCKED',
    'EXPIRED',
    'SUSPENDED',
    'SKIPPED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE referral_rule_event_type AS ENUM (
    'FIRST_ORDER_DELIVERED',
    'ORDER_DELIVERED_COUNT',
    'KYC_APPROVED',
    'SIGNUP',
    'CUSTOM'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE referral_reward_job_status AS ENUM (
    'queued',
    'processing',
    'succeeded',
    'failed',
    'retrying',
    'skipped',
    'cancelled',
    'dead'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Extend relationships with lifecycle + campaign + expiry + install attribution
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_relationships' AND column_name='lifecycle_state') THEN
    ALTER TABLE referral_relationships
      ADD COLUMN lifecycle_state referral_lifecycle_state NOT NULL DEFAULT 'REFERRAL_APPLIED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_relationships' AND column_name='campaign_id') THEN
    ALTER TABLE referral_relationships ADD COLUMN campaign_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_relationships' AND column_name='expires_at') THEN
    ALTER TABLE referral_relationships ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_relationships' AND column_name='install_referrer_raw') THEN
    ALTER TABLE referral_relationships ADD COLUMN install_referrer_raw TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_relationships' AND column_name='install_referrer_click_ts') THEN
    ALTER TABLE referral_relationships ADD COLUMN install_referrer_click_ts TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_relationships' AND column_name='first_open_at') THEN
    ALTER TABLE referral_relationships ADD COLUMN first_open_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_relationships' AND column_name='attribution_consumed') THEN
    ALTER TABLE referral_relationships ADD COLUMN attribution_consumed BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_relationships' AND column_name='reinstall') THEN
    ALTER TABLE referral_relationships ADD COLUMN reinstall BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_relationships' AND column_name='city_id') THEN
    ALTER TABLE referral_relationships ADD COLUMN city_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_relationships' AND column_name='state_id') THEN
    ALTER TABLE referral_relationships ADD COLUMN state_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_relationships' AND column_name='platform') THEN
    ALTER TABLE referral_relationships ADD COLUMN platform TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_relationships' AND column_name='device_type') THEN
    ALTER TABLE referral_relationships ADD COLUMN device_type TEXT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS referral_lifecycle_events (
  id BIGSERIAL PRIMARY KEY,
  referral_relationship_id BIGINT REFERENCES referral_relationships(id) ON DELETE CASCADE,
  click_token TEXT,
  referral_code TEXT,
  user_type referral_user_type,
  from_state referral_lifecycle_state,
  to_state referral_lifecycle_state NOT NULL,
  event_name TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_lifecycle_events_rel_idx
  ON referral_lifecycle_events (referral_relationship_id, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_lifecycle_events_state_idx
  ON referral_lifecycle_events (to_state, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_lifecycle_events_code_idx
  ON referral_lifecycle_events (referral_code);

-- -----------------------------------------------------------------------------
-- 2. Campaigns
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_campaigns (
  id BIGSERIAL PRIMARY KEY,
  campaign_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  user_type referral_user_type, -- NULL = both
  city_ids BIGINT[] DEFAULT '{}',
  state_ids BIGINT[] DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 100,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  referral_validity_days INT NOT NULL DEFAULT 365,
  reward_expiry_days INT NOT NULL DEFAULT 90,
  reward_claim_window_days INT NOT NULL DEFAULT 30,
  monthly_reward_cap NUMERIC(12,2),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_campaigns_active_idx
  ON referral_campaigns (enabled, starts_at, ends_at);

INSERT INTO referral_campaigns (campaign_code, name, description, enabled, priority)
SELECT 'DEFAULT', 'Default Referral Campaign', 'System default campaign for customer + rider referrals', true, 1
WHERE NOT EXISTS (SELECT 1 FROM referral_campaigns WHERE campaign_code = 'DEFAULT');

-- Link relationships.campaign_id FK if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'referral_relationships_campaign_id_fkey'
  ) THEN
    ALTER TABLE referral_relationships
      ADD CONSTRAINT referral_relationships_campaign_id_fkey
      FOREIGN KEY (campaign_id) REFERENCES referral_campaigns(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Enhance reward rules → full rule engine columns
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_reward_rules' AND column_name='event_type') THEN
    ALTER TABLE referral_reward_rules
      ADD COLUMN event_type referral_rule_event_type NOT NULL DEFAULT 'FIRST_ORDER_DELIVERED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_reward_rules' AND column_name='campaign_id') THEN
    ALTER TABLE referral_reward_rules ADD COLUMN campaign_id BIGINT REFERENCES referral_campaigns(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_reward_rules' AND column_name='starts_at') THEN
    ALTER TABLE referral_reward_rules ADD COLUMN starts_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_reward_rules' AND column_name='ends_at') THEN
    ALTER TABLE referral_reward_rules ADD COLUMN ends_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_reward_rules' AND column_name='monthly_cap_override') THEN
    ALTER TABLE referral_reward_rules ADD COLUMN monthly_cap_override NUMERIC(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_reward_rules' AND column_name='reward_expiry_days') THEN
    ALTER TABLE referral_reward_rules ADD COLUMN reward_expiry_days INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_reward_rules' AND column_name='city_ids') THEN
    ALTER TABLE referral_reward_rules ADD COLUMN city_ids BIGINT[] DEFAULT '{}';
  END IF;
END $$;

-- Backfill event types from existing rules
UPDATE referral_reward_rules
SET event_type = CASE
  WHEN user_type = 'customer' THEN 'FIRST_ORDER_DELIVERED'::referral_rule_event_type
  ELSE 'ORDER_DELIVERED_COUNT'::referral_rule_event_type
END
WHERE event_type IS NULL OR event_type = 'FIRST_ORDER_DELIVERED';

UPDATE referral_reward_rules r
SET campaign_id = c.id
FROM referral_campaigns c
WHERE c.campaign_code = 'DEFAULT' AND r.campaign_id IS NULL;

UPDATE referral_reward_rules
SET event_type = 'ORDER_DELIVERED_COUNT'::referral_rule_event_type
WHERE user_type = 'rider';

-- -----------------------------------------------------------------------------
-- 4. Settings: expiry + fraud advanced + code policy
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_settings' AND column_name='referral_validity_days') THEN
    ALTER TABLE referral_settings ADD COLUMN referral_validity_days INT NOT NULL DEFAULT 365;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_settings' AND column_name='reward_expiry_days') THEN
    ALTER TABLE referral_settings ADD COLUMN reward_expiry_days INT NOT NULL DEFAULT 90;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_settings' AND column_name='reward_claim_window_days') THEN
    ALTER TABLE referral_settings ADD COLUMN reward_claim_window_days INT NOT NULL DEFAULT 30;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_settings' AND column_name='code_prefix_customer') THEN
    ALTER TABLE referral_settings ADD COLUMN code_prefix_customer TEXT NOT NULL DEFAULT 'GM';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_settings' AND column_name='code_prefix_rider') THEN
    ALTER TABLE referral_settings ADD COLUMN code_prefix_rider TEXT NOT NULL DEFAULT 'RIDER';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_settings' AND column_name='advanced_fraud') THEN
    ALTER TABLE referral_settings ADD COLUMN advanced_fraud JSONB NOT NULL DEFAULT '{
      "block_emulator": true,
      "block_rooted": true,
      "block_referral_loops": true,
      "max_installs_per_device": 3,
      "block_disposable_phones": true,
      "max_referrals_per_hour": 20,
      "block_vpn_proxy": false,
      "suspicious_ip_threshold": 10
    }'::jsonb;
  END IF;
END $$;

-- Expand notification_templates defaults
UPDATE referral_settings
SET notification_templates = notification_templates || '{
  "customer_reward": {"title":"Referral Reward Received","body":"₹{{amount}} GatiCash has been credited to your GatiCash wallet. Use it on your next GatiMitra order."},
  "customer_referrer": {"title":"Referral Successful","body":"Your friend completed their first order. ₹{{amount}} GatiCash has been credited."},
  "rider_milestone": {"title":"Referral Milestone Achieved","body":"₹{{amount}} has been credited to your Rider Wallet. You can withdraw this amount with your next withdrawal request."},
  "reward_failed": {"title":"Referral Reward Pending","body":"We could not credit your referral reward yet. Our team will retry shortly."},
  "reward_disabled": {"title":"Referral Tracked","body":"Your referral was tracked. Rewards are currently paused."},
  "fraud_blocked": {"title":"Referral Not Applied","body":"This referral could not be applied due to a policy check."}
}'::jsonb
WHERE id = 1;

-- -----------------------------------------------------------------------------
-- 5. Reward job queue (durable, retryable)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_reward_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_key TEXT NOT NULL UNIQUE,
  referral_relationship_id BIGINT NOT NULL REFERENCES referral_relationships(id) ON DELETE CASCADE,
  reward_rule_id BIGINT REFERENCES referral_reward_rules(id) ON DELETE SET NULL,
  campaign_id BIGINT REFERENCES referral_campaigns(id) ON DELETE SET NULL,
  user_type referral_user_type NOT NULL,
  beneficiary_user_id BIGINT NOT NULL,
  reward_party referral_reward_party NOT NULL DEFAULT 'referrer',
  reward_amount NUMERIC(12,2) NOT NULL,
  reward_type referral_reward_type NOT NULL,
  status referral_reward_job_status NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 8,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  reward_transaction_id BIGINT REFERENCES referral_reward_transactions(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS referral_reward_jobs_poll_idx
  ON referral_reward_jobs (status, next_attempt_at)
  WHERE status IN ('queued', 'retrying', 'failed');

-- Enrich reward transactions with full wallet references
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_reward_transactions' AND column_name='campaign_id') THEN
    ALTER TABLE referral_reward_transactions ADD COLUMN campaign_id BIGINT REFERENCES referral_campaigns(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_reward_transactions' AND column_name='referral_code') THEN
    ALTER TABLE referral_reward_transactions ADD COLUMN referral_code TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_reward_transactions' AND column_name='referrer_id') THEN
    ALTER TABLE referral_reward_transactions ADD COLUMN referrer_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_reward_transactions' AND column_name='referred_user_id') THEN
    ALTER TABLE referral_reward_transactions ADD COLUMN referred_user_id BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_reward_transactions' AND column_name='expires_at') THEN
    ALTER TABLE referral_reward_transactions ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referral_reward_transactions' AND column_name='admin_action') THEN
    ALTER TABLE referral_reward_transactions ADD COLUMN admin_action TEXT;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 6. Code management: blacklist, reserved prefixes, custom codes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_code_blacklist (
  id BIGSERIAL PRIMARY KEY,
  code_pattern TEXT NOT NULL UNIQUE,
  reason TEXT,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_code_reserved_prefixes (
  id BIGSERIAL PRIMARY KEY,
  prefix TEXT NOT NULL UNIQUE,
  user_type referral_user_type,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO referral_code_reserved_prefixes (prefix, user_type, description)
VALUES
  ('GM', 'customer', 'Default customer prefix'),
  ('RIDER', 'rider', 'Default rider prefix'),
  ('ADMIN', NULL, 'Reserved for admin custom codes'),
  ('TEST', NULL, 'Reserved for QA')
ON CONFLICT (prefix) DO NOTHING;

ALTER TABLE referral_codes
  ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS regenerated_from TEXT,
  ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT false;

-- Device attribution ledger (multi-install / reinstall detection)
CREATE TABLE IF NOT EXISTS referral_device_attributions (
  id BIGSERIAL PRIMARY KEY,
  device_fingerprint TEXT NOT NULL,
  user_type referral_user_type NOT NULL,
  user_id BIGINT,
  referral_code TEXT,
  install_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_open_at TIMESTAMPTZ,
  platform TEXT,
  is_emulator BOOLEAN NOT NULL DEFAULT false,
  is_rooted BOOLEAN NOT NULL DEFAULT false,
  install_referrer_raw TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_device_attr_fp_idx
  ON referral_device_attributions (device_fingerprint, user_type);

-- Funnel counters (daily aggregates for analytics)
CREATE TABLE IF NOT EXISTS referral_funnel_daily (
  id BIGSERIAL PRIMARY KEY,
  day DATE NOT NULL,
  user_type referral_user_type,
  campaign_id BIGINT,
  links_shared INT NOT NULL DEFAULT 0,
  link_clicks INT NOT NULL DEFAULT 0,
  play_store_opens INT NOT NULL DEFAULT 0,
  installs INT NOT NULL DEFAULT 0,
  first_app_opens INT NOT NULL DEFAULT 0,
  referrals_applied INT NOT NULL DEFAULT 0,
  first_orders INT NOT NULL DEFAULT 0,
  delivered_orders INT NOT NULL DEFAULT 0,
  rewards_granted INT NOT NULL DEFAULT 0,
  fraud_blocked INT NOT NULL DEFAULT 0,
  UNIQUE (day, user_type, campaign_id)
);

-- -----------------------------------------------------------------------------
-- 7. Additional notification templates
-- -----------------------------------------------------------------------------
INSERT INTO public.notification_templates
  (code, category, role, channel, title_template, body_template, deep_link, priority, variables_schema)
VALUES
  ('REFERRAL_REWARD_FAILED', 'wallet', 'customer', 'all',
   '{{title}}', '{{body}}', '/profile/referrals', 'normal',
   '{"title":"string","body":"string","amount":"number"}'::jsonb),
  ('REFERRAL_REWARD_DISABLED', 'wallet', 'customer', 'in_app',
   '{{title}}', '{{body}}', '/profile/referrals', 'low',
   '{"title":"string","body":"string"}'::jsonb),
  ('REFERRAL_FRAUD_BLOCKED', 'account', 'customer', 'in_app',
   '{{title}}', '{{body}}', '/profile/referrals', 'normal',
   '{"title":"string","body":"string"}'::jsonb),
  ('REFERRAL_REWARD_FAILED_RIDER', 'wallet', 'rider', 'all',
   '{{title}}', '{{body}}', '/profile', 'normal',
   '{"title":"string","body":"string","amount":"number"}'::jsonb)
ON CONFLICT (code, locale) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 8. Bump config so clients refetch
-- -----------------------------------------------------------------------------
SELECT public.bump_referral_config_version();
