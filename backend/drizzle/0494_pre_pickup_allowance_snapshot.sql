-- Dispatch Engine — Phase 4b: pre-pickup (first-mile) allowance snapshot.
--
-- Captured at rider ACCEPT (₹/km × actual pickup distance, rider GPS -> store) because
-- at delivery the rider's GPS is at the drop and the pickup distance can no longer be
-- recomputed. Paid into the rider credit on delivery. Additive + inert: default 0, so
-- until an admin sets platform_rider_dispatch_strategy_config.pre_pickup_rate_per_km > 0
-- every snapshot is 0 and no payout changes.

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS rider_pre_pickup_allowance NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rider_pickup_distance_meters INTEGER;

COMMENT ON COLUMN public.orders_core.rider_pre_pickup_allowance IS
  'First-mile rider allowance (rupees), snapshotted at accept (rate/km x pickup distance). Paid on delivery. 0 when the pre-pickup rate is unset.';
COMMENT ON COLUMN public.orders_core.rider_pickup_distance_meters IS
  'Rider GPS -> store distance (meters) at accept, used to compute rider_pre_pickup_allowance.';
