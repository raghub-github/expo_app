-- Ride catalog ↔ onboarding vehicle type assignments (vehicle-centric).
-- Single forward migration; no rollback file.
-- Keeps customer_ride_service_catalog.vehicle_types in sync for dispatch matching.

CREATE TABLE IF NOT EXISTS ride_catalog_vehicle_type_assignments (
  id bigserial PRIMARY KEY,
  vehicle_type_code text NOT NULL
    REFERENCES rider_onboarding_vehicle_types (code) ON DELETE CASCADE,
  catalog_code text NOT NULL
    REFERENCES customer_ride_service_catalog (code) ON DELETE CASCADE,
  is_assigned boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ride_catalog_vehicle_type_assignments_uq
    UNIQUE (vehicle_type_code, catalog_code)
);

CREATE INDEX IF NOT EXISTS ride_catalog_vehicle_type_assignments_vehicle_idx
  ON ride_catalog_vehicle_type_assignments (vehicle_type_code)
  WHERE is_assigned = true;

CREATE INDEX IF NOT EXISTS ride_catalog_vehicle_type_assignments_catalog_idx
  ON ride_catalog_vehicle_type_assignments (catalog_code)
  WHERE is_assigned = true;

COMMENT ON TABLE ride_catalog_vehicle_type_assignments IS
  'Maps each onboarding vehicle type to customer ride catalog options (bike, auto, cab-economy, …).';

-- Backfill from existing catalog.vehicle_types using maps_to_vehicle_type.
INSERT INTO ride_catalog_vehicle_type_assignments (
  vehicle_type_code, catalog_code, is_assigned, updated_at
)
SELECT
  vt.code,
  cat.code,
  true,
  now()
FROM customer_ride_service_catalog cat
CROSS JOIN LATERAL unnest(cat.vehicle_types) AS vt_code(code)
INNER JOIN rider_onboarding_vehicle_types vt
  ON lower(trim(vt.maps_to_vehicle_type)) = lower(trim(vt_code.code))
 AND vt.is_active = true
ON CONFLICT (vehicle_type_code, catalog_code) DO UPDATE SET
  is_assigned = true,
  updated_at = now();
