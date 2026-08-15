-- Rollback 0536. Enum values (merchant, new event types) cannot be removed in
-- PostgreSQL without rewriting the type — left in place safely.
-- Only run if no merchant referral_reward_rules / relationships exist.

ALTER TABLE referral_reward_rules
  DROP CONSTRAINT IF EXISTS referral_reward_rules_reward_mode_check;

ALTER TABLE referral_reward_rules
  DROP COLUMN IF EXISTS reward_mode;

ALTER TABLE referral_settings
  DROP CONSTRAINT IF EXISTS referral_settings_reward_mode_check;

ALTER TABLE referral_settings
  DROP COLUMN IF EXISTS merchant_referral_enabled,
  DROP COLUMN IF EXISTS merchant_reward_enabled,
  DROP COLUMN IF EXISTS code_prefix_merchant,
  DROP COLUMN IF EXISTS reward_mode,
  DROP COLUMN IF EXISTS referral_expiry_enabled,
  DROP COLUMN IF EXISTS max_successful_referrals,
  DROP COLUMN IF EXISTS campaign_budget;

ALTER TABLE referral_reward_rules
  DROP CONSTRAINT IF EXISTS referral_reward_rules_type_check;

ALTER TABLE referral_reward_rules
  ADD CONSTRAINT referral_reward_rules_type_check CHECK (
    (user_type = 'customer' AND reward_type = 'GATICASH')
    OR (user_type = 'rider' AND reward_type = 'WALLET_CREDIT')
  );
