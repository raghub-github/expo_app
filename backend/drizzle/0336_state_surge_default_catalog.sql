-- Seed 4 built-in rider surge rules for every state (disabled, ₹0).

INSERT INTO state_surge_configs (
  state_id, name, description, enabled, surge_type, amount,
  vehicle_type, applies_food, applies_parcel, applies_ride,
  max_riders_only, priority, manual_active
)
SELECT
  s.id,
  v.name,
  v.description,
  false,
  'fixed'::state_surge_type,
  0,
  'all'::state_surge_vehicle_scope,
  true,
  true,
  true,
  false,
  v.priority,
  false
FROM states s
CROSS JOIN (
  VALUES
    ('Peak Hour Surge', 'Auto-applies during configured peak time windows', 100),
    ('Rain Surge', 'Manual rain surge — future weather API ready', 90),
    ('Festival Surge', 'Manual festival / holiday surge', 80),
    ('Night Surge', 'Night-time rider incentive (23:00–03:00 window)', 70)
) AS v(name, description, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM state_surge_configs c
  WHERE c.state_id = s.id AND c.name = v.name AND c.deleted_at IS NULL
);

INSERT INTO state_surge_time_slots (state_surge_id, start_time, end_time, days_of_week, is_enabled)
SELECT sc.id, slot.start_time::time, slot.end_time::time, ARRAY[0,1,2,3,4,5,6]::smallint[], true
FROM state_surge_configs sc
CROSS JOIN (
  VALUES ('11:00', '15:00'), ('19:00', '22:00')
) AS slot(start_time, end_time)
WHERE sc.name = 'Peak Hour Surge' AND sc.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM state_surge_time_slots ts WHERE ts.state_surge_id = sc.id
  );

INSERT INTO state_surge_time_slots (state_surge_id, start_time, end_time, days_of_week, is_enabled)
SELECT sc.id, '23:00'::time, '03:00'::time, ARRAY[0,1,2,3,4,5,6]::smallint[], true
FROM state_surge_configs sc
WHERE sc.name = 'Night Surge' AND sc.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM state_surge_time_slots ts WHERE ts.state_surge_id = sc.id
  );
