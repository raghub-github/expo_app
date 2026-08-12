-- Geo Delivery Pricing v3.1 — pre-pickup (first-mile) allowance composed WITHIN the
-- rider % pool instead of always added on top.
--
-- 1) Freeze the first-mile funding source per order (accept-time snapshot) so an admin
--    changing the service default later never retroactively alters an in-flight payout.
-- 2) Seed the per-service funding defaults the product decision calls for:
--       FOOD         → 'company'  (first-mile is a company top-up, on top of the pool)
--       PARCEL       → 'customer' (first-mile carved from the pool, collected from user)
--       PERSON RIDE  → 'customer' (same — collected after the ride)
--
-- Behaviour-preserving for money already committed: rider_pre_pickup_funding is NULL for
-- historical/in-flight orders, and the settlement engine falls back to the service
-- default only for orders accepted AFTER this migration (the accept step now stamps it).

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS rider_pre_pickup_funding TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_core_rider_pre_pickup_funding_check'
  ) THEN
    ALTER TABLE public.orders_core
      ADD CONSTRAINT orders_core_rider_pre_pickup_funding_check
      CHECK (rider_pre_pickup_funding IS NULL
             OR rider_pre_pickup_funding IN ('company', 'customer', 'shared'));
  END IF;
END $$;

COMMENT ON COLUMN public.orders_core.rider_pre_pickup_funding IS
  'First-mile funding frozen at accept: company (on top) | customer (within pool) | shared (pool + company overflow). NULL = legacy company-on-top.';

-- Per-service funding defaults. The Phase 0 seed created every row with the single old
-- default 'company'; flip parcel + person_ride to the customer/within-pool model. Only
-- rows still at that default are touched, so a deliberate admin override is preserved.
UPDATE public.platform_rider_dispatch_strategy_config
   SET pre_pickup_funding = 'customer'
 WHERE service_type IN ('parcel', 'person_ride')
   AND (pre_pickup_funding IS NULL OR pre_pickup_funding = 'company');
