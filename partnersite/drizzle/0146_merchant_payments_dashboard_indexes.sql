-- Partner payments dashboard: analytics + payout list query support
-- Safe to re-run (IF NOT EXISTS). Requires merchant_wallet + merchant_payout_requests from merchant_wallet.sql.

CREATE INDEX IF NOT EXISTS merchant_wallet_ledger_wallet_category_created_idx
  ON public.merchant_wallet_ledger (wallet_id, category, created_at DESC);

CREATE INDEX IF NOT EXISTS merchant_payout_requests_wallet_status_requested_idx
  ON public.merchant_payout_requests (wallet_id, status, requested_at DESC);

COMMENT ON INDEX public.merchant_wallet_ledger_wallet_category_created_idx IS
  'Earnings/withdrawal daily aggregates for /api/merchant/wallet/analytics';

COMMENT ON INDEX public.merchant_payout_requests_wallet_status_requested_idx IS
  'Payout summary + recent list for partner payments dashboard';
