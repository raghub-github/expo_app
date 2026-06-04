-- Vehicle categories (2 / 3 / 4 wheeler) + per-category vehicle catalog with doc rules.

CREATE TABLE IF NOT EXISTS rider_onboarding_vehicle_categories (
  id          BIGSERIAL PRIMARY KEY,
  code        TEXT NOT NULL,
  label       TEXT NOT NULL,
  hint        TEXT,
  icon        TEXT,
  wheel_count INT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rider_onboarding_vehicle_categories_code_uq UNIQUE (code),
  CONSTRAINT rider_onboarding_vehicle_categories_wheel_chk CHECK (wheel_count IN (2, 3, 4))
);

CREATE INDEX IF NOT EXISTS rider_onboarding_vehicle_categories_sort_idx
  ON rider_onboarding_vehicle_categories (sort_order, id);

ALTER TABLE rider_onboarding_vehicle_types
  ADD COLUMN IF NOT EXISTS category_code TEXT;

CREATE INDEX IF NOT EXISTS rider_onboarding_vehicle_types_category_idx
  ON rider_onboarding_vehicle_types (category_code, sort_order, id);

-- Retire legacy operating-method rows (own / rental_ev / cycle)
UPDATE rider_onboarding_vehicle_types
SET is_active = FALSE, updated_at = NOW()
WHERE code IN ('own', 'rental_ev', 'cycle');

INSERT INTO rider_onboarding_vehicle_categories (code, label, hint, icon, wheel_count, sort_order)
VALUES
  ('2_wheeler', '2 Wheeler', 'Bicycle, Bike, Scooter & more', 'bicycle-outline', 2, 1),
  ('3_wheeler', '3 Wheeler', 'Auto, EV Auto, Cargo & Loader', 'bus-outline', 3, 2),
  ('4_wheeler', '4 Wheeler', 'Ace, Pickup, Van & Mini Truck', 'car-sport-outline', 4, 3)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  hint = EXCLUDED.hint,
  icon = EXCLUDED.icon,
  wheel_count = EXCLUDED.wheel_count,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE,
  updated_at = NOW();

INSERT INTO rider_onboarding_vehicle_types (
  code, category_code, label, hint, icon, sort_order, onboarding_flow,
  document_requirements, info_message, maps_to_vehicle_type, is_active
)
VALUES
  -- 2 Wheeler
  (
    'bicycle', '2_wheeler', 'Bicycle', 'No DL required', 'bicycle-outline', 1, 'payment',
    '{"required_docs":[],"has_own_vehicle":false}'::jsonb,
    'No vehicle documents required. Continue to payment.',
    'cycle', TRUE
  ),
  (
    'e_cycle', '2_wheeler', 'E-Cycle', 'Electric cycle', 'battery-half-outline', 2, 'payment',
    '{"required_docs":[],"has_own_vehicle":false}'::jsonb,
    'No vehicle documents required. Continue to payment.',
    'e_cycle', TRUE
  ),
  (
    'bike', '2_wheeler', 'Bike', 'DL & RC required', 'speedometer-outline', 3, 'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    NULL, 'bike', TRUE
  ),
  (
    'scooter', '2_wheeler', 'Scooter', 'DL & RC required', 'navigate-outline', 4, 'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    NULL, 'scooter', TRUE
  ),
  (
    'ev_bike', '2_wheeler', 'EV Bike', 'Rental or EV proof required', 'flash-outline', 5, 'rental_ev',
    '{"required_docs":["rental_proof","ev_proof"],"has_own_vehicle":false,"requires_max_speed":true}'::jsonb,
    'Upload rental agreement or EV ownership proof on the next screen.',
    'ev_bike', TRUE
  ),
  -- 3 Wheeler
  (
    'auto_rickshaw', '3_wheeler', 'Auto Rickshaw', 'DL & RC required', 'car-outline', 1, 'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    NULL, 'auto', TRUE
  ),
  (
    'ev_auto', '3_wheeler', 'EV Auto', 'Rental or EV proof required', 'flash-outline', 2, 'rental_ev',
    '{"required_docs":["rental_proof","ev_proof"],"has_own_vehicle":false,"requires_max_speed":true}'::jsonb,
    'Upload rental agreement or EV ownership proof on the next screen.',
    'ev_auto', TRUE
  ),
  (
    'cargo_auto', '3_wheeler', 'Cargo Auto', 'DL & RC required', 'cube-outline', 3, 'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    NULL, 'cargo_auto', TRUE
  ),
  (
    'loader_auto', '3_wheeler', 'Loader Auto', 'DL & RC required', 'construct-outline', 4, 'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    NULL, 'loader_auto', TRUE
  ),
  -- 4 Wheeler
  (
    'tata_ace', '4_wheeler', 'Tata Ace', 'DL & RC required', 'bus-outline', 1, 'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    NULL, 'tata_ace', TRUE
  ),
  (
    'pickup', '4_wheeler', 'Pickup', 'DL & RC required', 'car-sport-outline', 2, 'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    NULL, 'pickup', TRUE
  ),
  (
    'cargo_van', '4_wheeler', 'Cargo Van', 'DL & RC required', 'cube-outline', 3, 'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    NULL, 'cargo_van', TRUE
  ),
  (
    'mini_truck', '4_wheeler', 'Mini Truck', 'DL & RC required', 'train-outline', 4, 'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    NULL, 'mini_truck', TRUE
  )
ON CONFLICT (code) DO UPDATE SET
  category_code = EXCLUDED.category_code,
  label = EXCLUDED.label,
  hint = EXCLUDED.hint,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  onboarding_flow = EXCLUDED.onboarding_flow,
  document_requirements = EXCLUDED.document_requirements,
  info_message = EXCLUDED.info_message,
  maps_to_vehicle_type = EXCLUDED.maps_to_vehicle_type,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

COMMENT ON TABLE rider_onboarding_vehicle_categories IS
  'Super-admin catalog: 2 / 3 / 4 wheeler groups for rider vehicle selection.';

COMMENT ON COLUMN rider_onboarding_vehicle_types.category_code IS
  'FK to rider_onboarding_vehicle_categories.code — groups vehicles under wheeler type.';
