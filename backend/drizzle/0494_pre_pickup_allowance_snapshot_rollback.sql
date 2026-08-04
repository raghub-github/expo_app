-- Rollback for 0494_pre_pickup_allowance_snapshot.sql
ALTER TABLE public.orders_core
  DROP COLUMN IF EXISTS rider_pre_pickup_allowance,
  DROP COLUMN IF EXISTS rider_pickup_distance_meters;
