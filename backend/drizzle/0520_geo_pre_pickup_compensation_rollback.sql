-- Rollback for 0520_geo_pre_pickup_compensation.sql
DROP FUNCTION IF EXISTS geo_pre_pickup_comp_effective(geo_pricing_level, uuid, order_type);
DROP TABLE IF EXISTS geo_pre_pickup_compensation;
