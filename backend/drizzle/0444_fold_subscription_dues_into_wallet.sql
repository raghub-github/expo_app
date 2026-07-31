-- Fold subscription_dues_outstanding into rider_wallet.total_balance so the wallet
-- balance is the SINGLE source of truth (no separate ₹35 subscription cap).
-- Migration: 0444_fold_subscription_dues_into_wallet
--
-- Before: a rider could be wallet −₹35 + dues ₹20 (total owed ₹55) — two numbers.
-- After:  wallet −₹55, dues 0 — one number; paying abs(balance) clears everything.
--
-- Idempotent: only touches riders whose subscription_dues_outstanding > 0, and
-- zeroes it in the same pass, so a re-run is a no-op.

-- 0. Ensure a wallet row exists for every rider carrying outstanding dues, so the
--    fold below never loses value.
INSERT INTO public.rider_wallet (rider_id, total_balance, last_updated_at)
SELECT r.id, 0, NOW()
FROM public.riders r
WHERE COALESCE(r.subscription_dues_outstanding, 0) > 0
ON CONFLICT (rider_id) DO NOTHING;

-- 1. Auditable ledger row for each fold (positive amount; entry_type marks a debit).
INSERT INTO public.wallet_ledger (
  rider_id, entry_type, amount, balance, service_type, ref, ref_type,
  description, metadata, performed_by_type, created_at
)
SELECT
  r.id, 'subscription_fee',
  ROUND(r.subscription_dues_outstanding::numeric, 2), NULL, NULL,
  'fold_dues:' || r.id::text, 'subscription',
  'Subscription dues folded into wallet balance',
  jsonb_build_object('foldedFromDues', ROUND(r.subscription_dues_outstanding::numeric, 2)),
  'system', NOW()
FROM public.riders r
WHERE COALESCE(r.subscription_dues_outstanding, 0) > 0;

-- 2. Deepen the wallet negative by the outstanding dues.
UPDATE public.rider_wallet w
SET total_balance = ROUND((w.total_balance - r.subscription_dues_outstanding)::numeric, 2),
    last_updated_at = NOW()
FROM public.riders r
WHERE r.id = w.rider_id
  AND COALESCE(r.subscription_dues_outstanding, 0) > 0;

-- 3. Zero the outstanding dues — now fully represented in the wallet balance.
UPDATE public.riders
SET subscription_dues_outstanding = 0, updated_at = NOW()
WHERE COALESCE(subscription_dues_outstanding, 0) > 0;
