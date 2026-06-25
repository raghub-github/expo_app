-- Super-admin: assign dispatch services per onboarding vehicle category (2/3/4 wheeler).
-- Dispatch engine only pushes offers for services assigned here ∩ rider duty ∩ vehicle.

CREATE TABLE IF NOT EXISTS rider_vehicle_category_service_assignments (
  id            BIGSERIAL PRIMARY KEY,
  category_code TEXT NOT NULL,
  service_type  TEXT NOT NULL,
  is_assigned   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rider_vcsa_category_fk
    FOREIGN KEY (category_code) REFERENCES rider_onboarding_vehicle_categories(code) ON DELETE CASCADE,
  CONSTRAINT rider_vcsa_service_chk CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT rider_vcsa_category_service_uq UNIQUE (category_code, service_type)
);

CREATE INDEX IF NOT EXISTS rider_vcsa_category_idx
  ON rider_vehicle_category_service_assignments (category_code);

INSERT INTO rider_vehicle_category_service_assignments (category_code, service_type, is_assigned)
VALUES
  ('2_wheeler', 'food', TRUE),
  ('2_wheeler', 'parcel', TRUE),
  ('2_wheeler', 'person_ride', TRUE),
  ('3_wheeler', 'food', FALSE),
  ('3_wheeler', 'parcel', TRUE),
  ('3_wheeler', 'person_ride', TRUE),
  ('4_wheeler', 'food', FALSE),
  ('4_wheeler', 'parcel', FALSE),
  ('4_wheeler', 'person_ride', TRUE)
ON CONFLICT (category_code, service_type) DO UPDATE SET
  is_assigned = EXCLUDED.is_assigned,
  updated_at = NOW();
