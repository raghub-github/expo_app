-- Ensure slab pricing money/rate columns use decimal-safe numeric types.
-- Idempotent: only alters columns that are not already numeric.

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('delivery_rate_slabs', 'base_fare'),
        ('delivery_rate_slabs', 'per_km_rate'),
        ('delivery_rate_slabs', 'min_charge'),
        ('delivery_rate_slabs', 'waiting_charge_per_min'),
        ('food_rider_pickup_slabs', 'base_fare'),
        ('food_rider_pickup_slabs', 'pickup_per_km'),
        ('food_rider_pickup_slabs', 'min_charge'),
        ('food_rider_pickup_slabs', 'waiting_charge_per_min'),
        ('food_rider_drop_slabs', 'drop_per_km'),
        ('parcel_rider_pickup_slabs', 'base_fare'),
        ('parcel_rider_pickup_slabs', 'pickup_per_km'),
        ('parcel_rider_pickup_slabs', 'min_charge'),
        ('parcel_rider_pickup_slabs', 'waiting_charge_per_min'),
        ('parcel_rider_drop_slabs', 'drop_per_km'),
        ('ride_rider_pickup_slabs', 'base_fare'),
        ('ride_rider_pickup_slabs', 'pickup_per_km'),
        ('ride_rider_pickup_slabs', 'min_charge'),
        ('ride_rider_pickup_slabs', 'waiting_charge_per_min'),
        ('ride_rider_drop_slabs', 'drop_per_km'),
        ('ride_customer_pricing', 'base_fare'),
        ('ride_customer_pricing', 'per_km_rate'),
        ('ride_customer_pricing', 'min_charge')
    ) AS t(table_name, column_name)
  LOOP
    IF to_regclass(rec.table_name) IS NULL THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = rec.table_name
        AND c.column_name = rec.column_name
        AND c.data_type NOT IN ('numeric', 'decimal')
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE numeric(12,2) USING %I::numeric(12,2)',
        rec.table_name,
        rec.column_name,
        rec.column_name
      );
    END IF;
  END LOOP;
END
$$;

COMMENT ON COLUMN delivery_rate_slabs.per_km_rate IS 'Customer/rider per-km rate; numeric(12,2) supports decimal pricing.';
