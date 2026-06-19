-- Freeze rider payout (base + surge) at ride accept so final billing never drifts.
-- Migration: 0341_ride_accept_payout_snapshot

ALTER TABLE public.orders_ride
  ADD COLUMN IF NOT EXISTS accept_payout_snapshot JSONB NULL;

COMMENT ON COLUMN public.orders_ride.accept_payout_snapshot IS
  'Rider payout frozen at accept: baseEarning, surgeEarning, appliedSurges, distances. Source of truth for surge shown to rider.';

-- Backfill from billing_snapshot.rider_payout_snapshot where present.
UPDATE public.orders_ride r
SET accept_payout_snapshot = oc.billing_snapshot -> 'rider_payout_snapshot'
FROM public.orders_core oc
WHERE oc.id = r.order_id
  AND r.accept_payout_snapshot IS NULL
  AND oc.billing_snapshot IS NOT NULL
  AND jsonb_typeof(oc.billing_snapshot -> 'rider_payout_snapshot') = 'object'
  AND (oc.billing_snapshot -> 'rider_payout_snapshot' ->> 'totalEarning') IS NOT NULL;
