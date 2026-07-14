-- Rollback for 0413_service_payout_rules.sql
-- Restores the old slab tables' comments and drops the new table. Does NOT
-- restore any deleted service_payout_rules data.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'food_rider_pickup_slabs') THEN
    COMMENT ON TABLE food_rider_pickup_slabs IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'food_rider_drop_slabs') THEN
    COMMENT ON TABLE food_rider_drop_slabs IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'parcel_rider_pickup_slabs') THEN
    COMMENT ON TABLE parcel_rider_pickup_slabs IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'parcel_rider_drop_slabs') THEN
    COMMENT ON TABLE parcel_rider_drop_slabs IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ride_rider_pickup_slabs') THEN
    COMMENT ON TABLE ride_rider_pickup_slabs IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ride_rider_drop_slabs') THEN
    COMMENT ON TABLE ride_rider_drop_slabs IS NULL;
  END IF;
END
$$;

DROP TABLE IF EXISTS service_payout_rules;
