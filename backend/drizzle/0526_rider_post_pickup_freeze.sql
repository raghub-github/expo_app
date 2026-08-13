-- Geo Delivery Pricing v3.2 — freeze the POST-pickup leg at accept for immutable settlement.
--
-- The PRE-pickup leg is already frozen at accept in rider_pre_pickup_allowance +
-- rider_pre_pickup_funding. This adds the matching POST-pickup freeze so the rider is paid
-- exactly the independently-priced pre + post legs that were resolved when they accepted —
-- never recomputed with tomorrow's rules.
--
-- Additive & non-destructive: NULL post amount ⇒ post = the rider-% pool remainder (the
-- existing v3.1 behaviour), so nothing changes until post-pickup leg rules are configured.

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS rider_post_pickup_amount  numeric(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS rider_post_pickup_funding text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_core_rider_post_pickup_funding_check'
  ) THEN
    ALTER TABLE public.orders_core
      ADD CONSTRAINT orders_core_rider_post_pickup_funding_check
      CHECK (rider_post_pickup_funding IS NULL
             OR rider_post_pickup_funding IN ('company', 'customer', 'shared'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_core_rider_post_pickup_amount_nonneg'
  ) THEN
    ALTER TABLE public.orders_core
      ADD CONSTRAINT orders_core_rider_post_pickup_amount_nonneg
      CHECK (rider_post_pickup_amount IS NULL OR rider_post_pickup_amount >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.orders_core.rider_post_pickup_amount IS
  'Post-pickup (pickup→drop) leg raw entitlement frozen at accept (rider_leg_pricing). NULL ⇒ pool remainder.';
COMMENT ON COLUMN public.orders_core.rider_post_pickup_funding IS
  'Post-pickup leg funding frozen at accept: company | customer | shared. NULL ⇒ customer/within-pool.';
