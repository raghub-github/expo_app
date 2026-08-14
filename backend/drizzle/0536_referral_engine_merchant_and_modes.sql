-- =============================================================================
-- 0536 — Unified referral engine: merchant participant + reward mode
-- Depends on 0470 + 0471. Idempotent. No relationship backfill.
-- Numbered 0536 to avoid colliding with existing 0482 migrations.
--
-- I/O impact (production-safe):
--   * ALTER TYPE ADD VALUE — catalog only, no table rewrite
--   * ADD COLUMN ... DEFAULT on referral_settings (1-row singleton) and
--     referral_reward_rules — PG 11+ constant defaults do not rewrite the table
--   * DROP/ADD CHECK — catalog only
--   * UPDATE of the single referral_settings row (JSON merge)
--   * No full-table scans, no backfill of referral_relationships
-- =============================================================================

-- Enum values are committed in 0536a_referral_merchant_enum.sql (must run first).
-- This file only adds columns/constraints and updates the 1-row settings record.

-- 3. Settings: merchant toggles + campaign controls (defaults only; amounts stay in rules)
ALTER TABLE referral_settings
  ADD COLUMN IF NOT EXISTS merchant_referral_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE referral_settings
  ADD COLUMN IF NOT EXISTS merchant_reward_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE referral_settings
  ADD COLUMN IF NOT EXISTS code_prefix_merchant TEXT NOT NULL DEFAULT 'MX';

ALTER TABLE referral_settings
  ADD COLUMN IF NOT EXISTS reward_mode TEXT NOT NULL DEFAULT 'incremental';

ALTER TABLE referral_settings
  ADD COLUMN IF NOT EXISTS referral_expiry_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE referral_settings
  ADD COLUMN IF NOT EXISTS max_successful_referrals INT;

ALTER TABLE referral_settings
  ADD COLUMN IF NOT EXISTS campaign_budget NUMERIC(14, 2);

ALTER TABLE referral_settings
  DROP CONSTRAINT IF EXISTS referral_settings_reward_mode_check;

ALTER TABLE referral_settings
  ADD CONSTRAINT referral_settings_reward_mode_check
  CHECK (reward_mode IN ('incremental', 'highest_only'));

-- 4. Per-rule optional override of incremental vs highest-only
ALTER TABLE referral_reward_rules
  ADD COLUMN IF NOT EXISTS reward_mode TEXT;

ALTER TABLE referral_reward_rules
  DROP CONSTRAINT IF EXISTS referral_reward_rules_reward_mode_check;

ALTER TABLE referral_reward_rules
  ADD CONSTRAINT referral_reward_rules_reward_mode_check
  CHECK (reward_mode IS NULL OR reward_mode IN ('incremental', 'highest_only'));

-- Allow merchant WALLET_CREDIT (and keep customer GATICASH / rider WALLET_CREDIT)
ALTER TABLE referral_reward_rules
  DROP CONSTRAINT IF EXISTS referral_reward_rules_type_check;

ALTER TABLE referral_reward_rules
  ADD CONSTRAINT referral_reward_rules_type_check CHECK (
    (user_type = 'customer' AND reward_type = 'GATICASH')
    OR (user_type IN ('rider', 'merchant') AND reward_type = 'WALLET_CREDIT')
  );

COMMENT ON TABLE referral_reward_rules IS
  'DB-driven reward rules for customer (GatiCash), rider and merchant (wallet). Amounts/thresholds never hardcoded in apps.';

-- 5. Deep-link + notification templates for merchant (1-row update)
UPDATE referral_settings
SET
  deep_link = COALESCE(deep_link, '{}'::jsonb) || jsonb_build_object(
    'merchant_path_prefix', COALESCE(deep_link->>'merchant_path_prefix', '/merchant-ref'),
    'play_store_merchant_package', COALESCE(deep_link->>'play_store_merchant_package', 'com.gatimitra.partner')
  ),
  notification_templates = COALESCE(notification_templates, '{}'::jsonb) || jsonb_build_object(
    'merchant_referrer', COALESCE(
      notification_templates->'merchant_referrer',
      '{"title":"Referral Reward Earned","body":"₹{{amount}} has been credited to your merchant wallet."}'::jsonb
    ),
    'merchant_reward', COALESCE(
      notification_templates->'merchant_reward',
      '{"title":"Referral Reward Received","body":"₹{{amount}} has been credited to your merchant wallet."}'::jsonb
    ),
    'rider_referred', COALESCE(
      notification_templates->'rider_referred',
      '{"title":"Milestone Unlocked","body":"₹{{amount}} has been credited to your rider wallet."}'::jsonb
    )
  ),
  updated_at = NOW()
WHERE id = 1;

-- No seed of merchant reward amounts — Super Admin creates rules. Existing rider
-- rules stay as-is (referrer-only until admin enables also_credit_referred).
