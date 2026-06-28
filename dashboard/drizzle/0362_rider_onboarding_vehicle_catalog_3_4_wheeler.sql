-- Seed / refresh 3-wheeler & 4-wheeler onboarding vehicle catalog (sort 7–17).
-- Uses optional_docs for EV types: dl + rc required; rental_proof + ev_proof optional.
-- loader_auto & cab_ac left inactive (optional launch).

INSERT INTO rider_onboarding_vehicle_categories (code, label, hint, icon, wheel_count, sort_order)
VALUES
  ('3_wheeler', '3 Wheeler', 'Auto, EV Auto, Cargo & Loader', 'bus-outline', 3, 2),
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
    'Cab, Sedan & EV Car',
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

INSERT INTO rider_onboarding_vehicle_types (
  code,
  category_code,
  label,
  hint,
  icon,
  sort_order,
  onboarding_flow,
  document_requirements,
  info_message,
  maps_to_vehicle_type,
  is_active
)
VALUES
  -- 7) Auto Rickshaw
  (
    'auto_rickshaw',
    '3_wheeler',
    'Auto Rickshaw',
    'DL & RC required',
    'car-outline',
    7,
    'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    'Driving License and Registration Certificate are required for auto onboarding.',
    'auto_rickshaw',
    TRUE
  ),
  -- 8) EV Auto
  (
    'ev_auto',
    '3_wheeler',
    'EV Auto',
    'Rental or EV proof required',
    'flash-outline',
    8,
    'rental_ev',
    '{"required_docs":["dl","rc"],"optional_docs":["rental_proof","ev_proof"],"has_own_vehicle":true}'::jsonb,
    'Upload rental agreement or EV proof if applicable for EV auto onboarding.',
    'ev_auto',
    TRUE
  ),
  -- 9) Cargo Auto
  (
    'cargo_auto',
    '3_wheeler',
    'Cargo Auto',
    'DL & RC required',
    'cube-outline',
    9,
    'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    'Driving License and Registration Certificate are required for cargo auto onboarding.',
    'cargo_auto',
    TRUE
  ),
  -- 10) Loader Auto (inactive — enable from dashboard when ready)
  (
    'loader_auto',
    '3_wheeler',
    'Loader Auto',
    'DL & RC required',
    'cube-outline',
    10,
    'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    'Driving License and Registration Certificate are required for loader auto onboarding.',
    'loader_auto',
    FALSE
  ),
  -- 11) Tata Ace
  (
    'tata_ace',
    '4_wheeler_non_ac',
    'Tata Ace',
    'DL & RC required',
    'cube-outline',
    11,
    'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    'Driving License and Registration Certificate are required for Tata Ace onboarding.',
    'tata_ace',
    TRUE
  ),
  -- 12) Pickup
  (
    'pickup',
    '4_wheeler_non_ac',
    'Pickup',
    'DL & RC required',
    'car-outline',
    12,
    'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    'Driving License and Registration Certificate are required for pickup onboarding.',
    'pickup',
    TRUE
  ),
  -- 13) Cargo Van
  (
    'cargo_van',
    '4_wheeler_non_ac',
    'Cargo Van',
    'DL & RC required',
    'cube-outline',
    13,
    'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    'Driving License and Registration Certificate are required for cargo van onboarding.',
    'cargo_van',
    TRUE
  ),
  -- 14) Mini Truck
  (
    'mini_truck',
    '4_wheeler_non_ac',
    'Mini Truck',
    'DL & RC required',
    'cube-outline',
    14,
    'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    'Driving License and Registration Certificate are required for mini truck onboarding.',
    'mini_truck',
    TRUE
  ),
  -- 15) Cab (AC) — inactive by default
  (
    'cab_ac',
    '4_wheeler_ac',
    'Cab (AC)',
    'DL & RC required',
    'car-outline',
    15,
    'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    'Driving License and Registration Certificate are required for cab onboarding.',
    'cab_ac',
    FALSE
  ),
  -- 16) Sedan (AC)
  (
    'sedan_ac',
    '4_wheeler_ac',
    'Sedan (AC)',
    'DL & RC required',
    'car-sport-outline',
    16,
    'dl_rc',
    '{"required_docs":["dl","rc"],"has_own_vehicle":true}'::jsonb,
    'Driving License and Registration Certificate are required for sedan onboarding.',
    'sedan_ac',
    TRUE
  ),
  -- 17) EV Car (AC)
  (
    'ev_car_ac',
    '4_wheeler_ac',
    'EV Car (AC)',
    'Rental or EV proof required',
    'flash-outline',
    17,
    'rental_ev',
    '{"required_docs":["dl","rc"],"optional_docs":["rental_proof","ev_proof"],"has_own_vehicle":true}'::jsonb,
    'Upload rental agreement or EV proof if applicable for EV car onboarding.',
    'ev_car_ac',
    TRUE
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

-- Keep dispatch service flags aligned with category defaults × active state.
INSERT INTO rider_onboarding_vehicle_type_service_assignments (vehicle_type_code, service_type, is_assigned)
SELECT
  vt.code,
  csa.service_type,
  (csa.is_assigned AND vt.is_active)
FROM rider_onboarding_vehicle_types vt
INNER JOIN rider_vehicle_category_service_assignments csa
  ON csa.category_code = vt.category_code
WHERE vt.code IN (
  'auto_rickshaw',
  'ev_auto',
  'cargo_auto',
  'loader_auto',
  'tata_ace',
  'pickup',
  'cargo_van',
  'mini_truck',
  'cab_ac',
  'sedan_ac',
  'ev_car_ac'
)
ON CONFLICT (vehicle_type_code, service_type) DO UPDATE SET
  is_assigned = EXCLUDED.is_assigned,
  updated_at = NOW();
