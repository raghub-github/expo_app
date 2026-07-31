-- Rollback 0466
DROP TABLE IF EXISTS ride_toll_events;
DROP INDEX IF EXISTS ride_night_configs_geo_idx;
DROP TABLE IF EXISTS ride_night_configs;

ALTER TABLE service_payout_rules
  DROP CONSTRAINT IF EXISTS service_payout_rules_waiting_funding_chk;
ALTER TABLE service_payout_rules
  DROP COLUMN IF EXISTS waiting_max_charge,
  DROP COLUMN IF EXISTS waiting_funding_mode,
  DROP COLUMN IF EXISTS waiting_customer_share_pct,
  DROP COLUMN IF EXISTS waiting_company_share_pct;

ALTER TABLE ride_wallet_config DROP COLUMN IF EXISTS commission_on_toll;
ALTER TABLE ride_wallet_config_history DROP COLUMN IF EXISTS commission_on_toll;

-- Enum values cannot be dropped safely in PG — leave WAITING_FEE/NIGHT_FEE/TOLL_FEE/SERVICE_FEE.
