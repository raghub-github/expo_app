-- Align rider onboarding categories with delivery slab vehicle types:
-- 2_wheeler, 3_wheeler, 4_wheeler_non_ac, 4_wheeler_ac

INSERT INTO rider_onboarding_vehicle_categories (code, label, hint, icon, wheel_count, sort_order)
VALUES
  (
    '4_wheeler_non_ac',
    '4 Wheeler Non AC',
    'Ace, Pickup, Van & Mini Truck',
    'car-sport-outline',
    4,
    3
  ),
  (
    '4_wheeler_ac',
    '4 Wheeler AC',
    'Cab, Sedan & AC rides',
    'snow-outline',
    4,
    4
  )
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  hint = EXCLUDED.hint,
  icon = EXCLUDED.icon,
  wheel_count = EXCLUDED.wheel_count,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE,
  updated_at = NOW();

UPDATE rider_onboarding_vehicle_types
SET category_code = '4_wheeler_non_ac', updated_at = NOW()
WHERE category_code = '4_wheeler';

UPDATE rider_vehicle_category_service_assignments
SET category_code = '4_wheeler_non_ac', updated_at = NOW()
WHERE category_code = '4_wheeler';

INSERT INTO rider_vehicle_category_service_assignments (category_code, service_type, is_assigned)
VALUES
  ('4_wheeler_ac', 'food', FALSE),
  ('4_wheeler_ac', 'parcel', FALSE),
  ('4_wheeler_ac', 'person_ride', TRUE)
ON CONFLICT (category_code, service_type) DO UPDATE SET
  is_assigned = EXCLUDED.is_assigned,
  updated_at = NOW();

INSERT INTO rider_onboarding_vehicle_types (
  code, category_code, label, hint, icon, sort_order, onboarding_flow,
  document_requirements, info_message, maps_to_vehicle_type, is_active
)
VALUES
  (
    'cab_ac', '4_wheeler_ac', 'Cab (AC)', 'DL & RC required', 'car-outline', 1, 'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    NULL, 'car', TRUE
  ),
  (
    'sedan_ac', '4_wheeler_ac', 'Sedan (AC)', 'DL & RC required', 'car-sport-outline', 2, 'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    NULL, 'taxi', TRUE
  ),
  (
    'ev_car_ac', '4_wheeler_ac', 'EV Car (AC)', 'Rental or EV proof required', 'flash-outline', 3, 'rental_ev',
    '{"required_docs":["rental_proof","ev_proof"],"has_own_vehicle":false,"requires_max_speed":true}'::jsonb,
    'Upload rental agreement or EV ownership proof on the next screen.',
    'ev_car', TRUE
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

INSERT INTO rider_onboarding_vehicle_type_service_assignments (vehicle_type_code, service_type, is_assigned)
SELECT vt.code, csa.service_type, (csa.is_assigned AND vt.is_active)
FROM rider_onboarding_vehicle_types vt
INNER JOIN rider_vehicle_category_service_assignments csa
  ON csa.category_code = vt.category_code
WHERE vt.category_code IN ('4_wheeler_non_ac', '4_wheeler_ac')
ON CONFLICT (vehicle_type_code, service_type) DO UPDATE SET
  is_assigned = EXCLUDED.is_assigned,
  updated_at = NOW();

UPDATE rider_onboarding_vehicle_categories
SET is_active = FALSE, updated_at = NOW()
WHERE code = '4_wheeler';
