-- Parcel customer pricing per vehicle type (progressive slabs) — mirrors ride_customer_pricing.
-- Single forward migration; no rollback file.

CREATE TABLE IF NOT EXISTS parcel_customer_pricing (
  id bigserial PRIMARY KEY,
  geo_level geo_pricing_level NOT NULL,
  geo_ref_id uuid NOT NULL,
  vehicle_type ride_vehicle_pricing_type NOT NULL,
  min_km numeric(10, 2) NOT NULL,
  max_km numeric(10, 2) NULL,
  base_fare numeric(12, 2) NULL,
  per_km_rate numeric(12, 2) NOT NULL DEFAULT 0,
  min_charge numeric(12, 2) NULL,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parcel_customer_pricing_min_km_nonneg CHECK (min_km >= 0),
  CONSTRAINT parcel_customer_pricing_max_km_valid CHECK (max_km IS NULL OR max_km > min_km),
  CONSTRAINT parcel_customer_pricing_base_fare_first_only CHECK (base_fare IS NULL OR min_km = 0),
  CONSTRAINT parcel_customer_pricing_per_km_nonneg CHECK (per_km_rate >= 0)
);

CREATE INDEX IF NOT EXISTS parcel_customer_pricing_geo_vehicle_idx
  ON parcel_customer_pricing (geo_level, geo_ref_id, vehicle_type, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS parcel_customer_pricing_geo_priority_idx
  ON parcel_customer_pricing (geo_level, geo_ref_id, vehicle_type, priority DESC, min_km ASC)
  WHERE deleted_at IS NULL AND is_active = true;

COMMENT ON TABLE parcel_customer_pricing IS
  'Parcel customer pricing per vehicle type (progressive slabs). Same shape as ride_customer_pricing.';
