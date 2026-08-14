-- Rollback for 0533_orders_parcel_pickup_wait_seconds.sql

ALTER TABLE orders_parcel DROP COLUMN IF EXISTS pickup_wait_seconds;
