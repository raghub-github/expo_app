-- 0470: Accept-linked daily GMitra Max fee
-- Daily auto-renew charges only on the rider's first successful order accept
-- each IST calendar day (not via time-based cron).

ALTER TABLE public.rider_subscriptions
  ADD COLUMN IF NOT EXISTS last_accept_fee_on_date date NULL;

COMMENT ON COLUMN public.rider_subscriptions.last_accept_fee_on_date IS
  'IST calendar date (YYYY-MM-DD) of the last accept-triggered daily subscription fee. Used for same-day idempotency.';

-- Backfill from latest subscription_fee ledger row so cutover does not double-charge today.
UPDATE public.rider_subscriptions rs
SET last_accept_fee_on_date = src.fee_ist_date,
    updated_at = NOW()
FROM (
  SELECT
    wl.rider_id,
    (MAX(wl.created_at) AT TIME ZONE 'Asia/Kolkata')::date AS fee_ist_date
  FROM public.wallet_ledger wl
  WHERE wl.entry_type = 'subscription_fee'
  GROUP BY wl.rider_id
) src
WHERE rs.rider_id = src.rider_id
  AND rs.status = 'active'
  AND rs.billing_cycle = 'daily'
  AND rs.last_accept_fee_on_date IS NULL;

-- Stop time-based cron targets for daily auto-renew (accept path owns charging).
UPDATE public.rider_subscriptions
SET
  next_deduction_at = NULL,
  updated_at = NOW()
WHERE billing_cycle = 'daily'
  AND COALESCE(auto_wallet_deduction, FALSE) = TRUE
  AND next_deduction_at IS NOT NULL;
