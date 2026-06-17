-- 0251_merchant_wallet_v2_columns.sql
--
-- Adds wallet V2 columns that the partnersite + dashboard wallet routes
-- expect. The columns existed in newer environments but were never
-- materialised on the production Supabase DB, causing 500s from
-- `partnersite/src/app/api/merchant/wallet/route.ts` with
-- `column merchant_wallet.locked_balance does not exist` (PG 42703).
--
-- `ADD COLUMN IF NOT EXISTS` makes this safe to re-run; environments
-- that already have the columns are no-ops.
--
-- `NOTIFY pgrst` tells PostgREST to drop its schema cache so REST queries
-- start seeing the new columns immediately (resolves PGRST002 errors
-- after this migration applies).

ALTER TABLE merchant_wallet
  ADD COLUMN IF NOT EXISTS locked_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_settlement NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_credit NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_debit NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_penalty NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_commission_deducted NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_paused BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: lifetime_credit / lifetime_debit derived from the ledger so
-- existing wallets show non-zero totals immediately. Safe re-run because
-- it only updates rows where the new columns are still at their default.
UPDATE merchant_wallet w SET
  lifetime_credit = COALESCE(
    (SELECT SUM(l.amount) FROM merchant_wallet_ledger l
       WHERE l.wallet_id = w.id AND l.direction = 'CREDIT'), 0),
  lifetime_debit = COALESCE(
    (SELECT SUM(l.amount) FROM merchant_wallet_ledger l
       WHERE l.wallet_id = w.id AND l.direction = 'DEBIT'), 0)
WHERE (w.lifetime_credit = 0 AND w.lifetime_debit = 0);

NOTIFY pgrst, 'reload schema';
