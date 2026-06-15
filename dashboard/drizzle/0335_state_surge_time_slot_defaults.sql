-- Standard peak & night time windows for all states (stored in state_surge_time_slots).
-- Dashboard mirror of backend 0338.

-- Peak Hour Surge: 11:00–15:00 and 19:00–22:00
DELETE FROM state_surge_time_slots ts
USING state_surge_configs sc
WHERE ts.state_surge_id = sc.id
  AND sc.name = 'Peak Hour Surge'
  AND sc.deleted_at IS NULL;

INSERT INTO state_surge_time_slots (state_surge_id, start_time, end_time, days_of_week, is_enabled)
SELECT sc.id, v.start_time::time, v.end_time::time, ARRAY[0,1,2,3,4,5,6]::smallint[], true
FROM state_surge_configs sc
CROSS JOIN (
  VALUES
    ('11:00', '15:00'),
    ('19:00', '22:00')
) AS v(start_time, end_time)
WHERE sc.name = 'Peak Hour Surge' AND sc.deleted_at IS NULL;

-- Night Surge: 23:00–03:00 (overnight)
DELETE FROM state_surge_time_slots ts
USING state_surge_configs sc
WHERE ts.state_surge_id = sc.id
  AND sc.name = 'Night Surge'
  AND sc.deleted_at IS NULL;

INSERT INTO state_surge_time_slots (state_surge_id, start_time, end_time, days_of_week, is_enabled)
SELECT sc.id, '23:00'::time, '03:00'::time, ARRAY[0,1,2,3,4,5,6]::smallint[], true
FROM state_surge_configs sc
WHERE sc.name = 'Night Surge' AND sc.deleted_at IS NULL;
