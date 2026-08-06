-- Dispatch Engine — Phase 5b: auto-cancel + refund on dispatch exhaustion (flag).
--
-- When an order stays unfilled past max_retry_duration_seconds (the retry window, set in
-- Super Admin → Dispatch coverage — e.g. 30-35 min), and this flag is ON, the order is
-- auto-cancelled and the customer is refunded, REUSING the existing cancellation engine
-- (executeOrderCancellationFinancials + applyMerchantOrderCancellationLedger +
-- autoRefundOnCancellation): full customer refund, and the merchant is compensated only
-- if the food was already prepared (partial credit) — nothing if it was not.
--
-- Default FALSE => behavior-preserving (dispatch just stops on exhaustion, as today).
-- Enable per service only after a DB-backed accept/exhaust/refund test.

ALTER TABLE public.platform_rider_dispatch_strategy_config
  ADD COLUMN IF NOT EXISTS auto_cancel_on_exhaustion BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.platform_rider_dispatch_strategy_config.auto_cancel_on_exhaustion IS
  'When true, an order unfilled after max_retry_duration_seconds is auto-cancelled + refunded (merchant compensated per prep stage via the existing cancel engine). Default false = dispatch just stops.';
