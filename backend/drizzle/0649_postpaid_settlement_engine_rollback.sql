-- Rollback 0649_postpaid_settlement_engine.sql
--
-- Do NOT narrow the ride_settlement_ledger CHECKs back to the 0463 lists: rows
-- written since 0649 use the added codes and the old constraint would fail to
-- re-validate. The widened constraints are inert for older code, so they stay.
-- Parcel settlement rows (service_type = 'parcel') must be reviewed before the
-- column is dropped; they are the only record of those settlements.

SET lock_timeout = '10s';

ALTER TABLE public.ride_wallet_config
  DROP CONSTRAINT IF EXISTS ride_wallet_config_min_wallet_balance_check,
  DROP CONSTRAINT IF EXISTS ride_wallet_config_min_balance_mode_check,
  DROP COLUMN IF EXISTS min_balance_mode,
  DROP COLUMN IF EXISTS min_wallet_balance;
ALTER TABLE public.ride_wallet_config_history
  DROP COLUMN IF EXISTS min_balance_mode,
  DROP COLUMN IF EXISTS min_wallet_balance;

DROP INDEX IF EXISTS public.wallet_ledger_rider_settlement_debit_ref_uidx;

DROP INDEX IF EXISTS public.ride_settlements_reconciliation_idx;
DROP INDEX IF EXISTS public.ride_settlements_service_posted_idx;
ALTER TABLE public.ride_settlements
  DROP CONSTRAINT IF EXISTS ride_settlements_reconciliation_status_check,
  DROP CONSTRAINT IF EXISTS ride_settlements_service_type_check,
  DROP COLUMN IF EXISTS reconciliation_flagged_at,
  DROP COLUMN IF EXISTS reconciliation_reason,
  DROP COLUMN IF EXISTS reconciliation_status,
  DROP COLUMN IF EXISTS wallet_balance_after,
  DROP COLUMN IF EXISTS wallet_balance_before,
  DROP COLUMN IF EXISTS incentive_amount,
  DROP COLUMN IF EXISTS tip_amount,
  DROP COLUMN IF EXISTS promotion_subsidy,
  DROP COLUMN IF EXISTS cash_collected,
  DROP COLUMN IF EXISTS service_type;

RESET lock_timeout;
