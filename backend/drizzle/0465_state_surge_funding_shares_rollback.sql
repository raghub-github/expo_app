-- Rollback: drop surge funding columns and their constraints.
ALTER TABLE state_surge_configs
  DROP CONSTRAINT IF EXISTS state_surge_share_sum_chk,
  DROP CONSTRAINT IF EXISTS state_surge_share_range_chk,
  DROP CONSTRAINT IF EXISTS state_surge_funding_mode_chk;

ALTER TABLE state_surge_configs
  DROP COLUMN IF EXISTS funding_mode,
  DROP COLUMN IF EXISTS customer_share_pct,
  DROP COLUMN IF EXISTS company_share_pct;
