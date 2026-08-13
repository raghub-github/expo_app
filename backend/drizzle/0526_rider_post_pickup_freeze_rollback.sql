-- Rollback for 0526_rider_post_pickup_freeze.sql
ALTER TABLE public.orders_core DROP CONSTRAINT IF EXISTS orders_core_rider_post_pickup_funding_check;
ALTER TABLE public.orders_core DROP CONSTRAINT IF EXISTS orders_core_rider_post_pickup_amount_nonneg;
ALTER TABLE public.orders_core DROP COLUMN IF EXISTS rider_post_pickup_amount;
ALTER TABLE public.orders_core DROP COLUMN IF EXISTS rider_post_pickup_funding;
