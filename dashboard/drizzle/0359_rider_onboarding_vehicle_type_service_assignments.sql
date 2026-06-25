-- Per onboarding vehicle type → dispatch service assignment (granular control).

CREATE TABLE IF NOT EXISTS rider_onboarding_vehicle_type_service_assignments (
  id                BIGSERIAL PRIMARY KEY,
  vehicle_type_code TEXT NOT NULL,
  service_type      TEXT NOT NULL,
  is_assigned       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rider_ovtsa_vehicle_fk
    FOREIGN KEY (vehicle_type_code) REFERENCES rider_onboarding_vehicle_types(code) ON DELETE CASCADE,
  CONSTRAINT rider_ovtsa_service_chk CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT rider_ovtsa_vehicle_service_uq UNIQUE (vehicle_type_code, service_type)
);

CREATE INDEX IF NOT EXISTS rider_ovtsa_vehicle_idx
  ON rider_onboarding_vehicle_type_service_assignments (vehicle_type_code);

INSERT INTO rider_onboarding_vehicle_type_service_assignments (vehicle_type_code, service_type, is_assigned)
SELECT
  vt.code,
  csa.service_type,
  (csa.is_assigned AND vt.is_active)
FROM rider_onboarding_vehicle_types vt
INNER JOIN rider_vehicle_category_service_assignments csa
  ON csa.category_code = vt.category_code
WHERE vt.category_code IS NOT NULL
ON CONFLICT (vehicle_type_code, service_type) DO UPDATE SET
  is_assigned = EXCLUDED.is_assigned,
  updated_at = NOW();
