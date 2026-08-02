-- Rollback for 0470_unified_referral_rewards_engine.sql
-- WARNING: Drops unified referral engine tables. Legacy tables are preserved.

DROP FUNCTION IF EXISTS bump_referral_config_version();

DROP TABLE IF EXISTS referral_install_clicks CASCADE;
DROP TABLE IF EXISTS referral_configuration_audit CASCADE;
DROP TABLE IF EXISTS referral_monthly_usage CASCADE;
DROP TABLE IF EXISTS referral_reward_transactions CASCADE;
DROP TABLE IF EXISTS referral_relationships CASCADE;
DROP TABLE IF EXISTS referral_codes CASCADE;
DROP TABLE IF EXISTS referral_reward_rules CASCADE;
DROP TABLE IF EXISTS referral_settings CASCADE;

DROP TYPE IF EXISTS referral_attribution_source;
DROP TYPE IF EXISTS referral_reward_party;
DROP TYPE IF EXISTS referral_reward_tx_status;
DROP TYPE IF EXISTS referral_relationship_status;
DROP TYPE IF EXISTS referral_reward_type;
DROP TYPE IF EXISTS referral_user_type;
