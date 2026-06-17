-- Rollback for 0251_merchant_wallet_v2_columns.sql
--
-- WARNING: dropping these columns will permanently lose any data they
-- accumulated. Only run if you have to revert the V2 wallet schema.

ALTER TABLE merchant_wallet
  DROP COLUMN IF EXISTS settlement_paused,
  DROP COLUMN IF EXISTS total_commission_deducted,
  DROP COLUMN IF EXISTS total_penalty,
  DROP COLUMN IF EXISTS lifetime_debit,
  DROP COLUMN IF EXISTS lifetime_credit,
  DROP COLUMN IF EXISTS pending_settlement,
  DROP COLUMN IF EXISTS locked_balance;

NOTIFY pgrst, 'reload schema';
