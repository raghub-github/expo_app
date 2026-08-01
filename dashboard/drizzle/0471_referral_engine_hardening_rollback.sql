-- Rollback for 0471_referral_engine_hardening.sql
-- Preserves 0470 core tables and reward history. Drops 0471 additions only.

DROP TABLE IF EXISTS referral_funnel_daily CASCADE;
DROP TABLE IF EXISTS referral_device_attributions CASCADE;
DROP TABLE IF EXISTS referral_code_reserved_prefixes CASCADE;
DROP TABLE IF EXISTS referral_code_blacklist CASCADE;
DROP TABLE IF EXISTS referral_reward_jobs CASCADE;
DROP TABLE IF EXISTS referral_lifecycle_events CASCADE;

ALTER TABLE referral_relationships DROP CONSTRAINT IF EXISTS referral_relationships_campaign_id_fkey;
DROP TABLE IF EXISTS referral_campaigns CASCADE;

ALTER TABLE referral_relationships
  DROP COLUMN IF EXISTS lifecycle_state,
  DROP COLUMN IF EXISTS campaign_id,
  DROP COLUMN IF EXISTS expires_at,
  DROP COLUMN IF EXISTS install_referrer_raw,
  DROP COLUMN IF EXISTS install_referrer_click_ts,
  DROP COLUMN IF EXISTS first_open_at,
  DROP COLUMN IF EXISTS attribution_consumed,
  DROP COLUMN IF EXISTS reinstall,
  DROP COLUMN IF EXISTS city_id,
  DROP COLUMN IF EXISTS state_id,
  DROP COLUMN IF EXISTS platform,
  DROP COLUMN IF EXISTS device_type;

ALTER TABLE referral_reward_rules
  DROP COLUMN IF EXISTS event_type,
  DROP COLUMN IF EXISTS campaign_id,
  DROP COLUMN IF EXISTS starts_at,
  DROP COLUMN IF EXISTS ends_at,
  DROP COLUMN IF EXISTS monthly_cap_override,
  DROP COLUMN IF EXISTS reward_expiry_days,
  DROP COLUMN IF EXISTS city_ids;

ALTER TABLE referral_settings
  DROP COLUMN IF EXISTS referral_validity_days,
  DROP COLUMN IF EXISTS reward_expiry_days,
  DROP COLUMN IF EXISTS reward_claim_window_days,
  DROP COLUMN IF EXISTS code_prefix_customer,
  DROP COLUMN IF EXISTS code_prefix_rider,
  DROP COLUMN IF EXISTS advanced_fraud;

ALTER TABLE referral_reward_transactions
  DROP COLUMN IF EXISTS campaign_id,
  DROP COLUMN IF EXISTS referral_code,
  DROP COLUMN IF EXISTS referrer_id,
  DROP COLUMN IF EXISTS referred_user_id,
  DROP COLUMN IF EXISTS expires_at,
  DROP COLUMN IF EXISTS admin_action;

ALTER TABLE referral_codes
  DROP COLUMN IF EXISTS is_custom,
  DROP COLUMN IF EXISTS regenerated_from,
  DROP COLUMN IF EXISTS suspended;

DROP TYPE IF EXISTS referral_reward_job_status;
DROP TYPE IF EXISTS referral_rule_event_type;
DROP TYPE IF EXISTS referral_lifecycle_state;
