-- Rollback 0469
DROP INDEX IF EXISTS ride_billing_activity_rider_idx;
DROP INDEX IF EXISTS ride_billing_activity_type_idx;
DROP INDEX IF EXISTS ride_billing_activity_order_idx;
DROP TABLE IF EXISTS ride_billing_activity;
