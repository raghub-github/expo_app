-- Rollback for 0524_rider_prepickup_funding_within_pool.sql
-- Reverts the per-service funding defaults to the legacy single 'company' default and
-- drops the per-order frozen funding column. Payouts revert to "first-mile on top".

UPDATE public.platform_rider_dispatch_strategy_config
   SET pre_pickup_funding = 'company'
 WHERE service_type IN ('parcel', 'person_ride')
   AND pre_pickup_funding = 'customer';

ALTER TABLE public.orders_core
  DROP CONSTRAINT IF EXISTS orders_core_rider_pre_pickup_funding_check;

ALTER TABLE public.orders_core
  DROP COLUMN IF EXISTS rider_pre_pickup_funding;
