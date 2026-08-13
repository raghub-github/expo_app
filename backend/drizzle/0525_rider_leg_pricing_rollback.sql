-- Rollback for 0525_rider_leg_pricing.sql
DROP FUNCTION IF EXISTS rider_leg_pricing_effective(text, geo_pricing_level, uuid, order_type, ride_vehicle_pricing_type, numeric, numeric);
DROP TABLE IF EXISTS rider_leg_pricing;
