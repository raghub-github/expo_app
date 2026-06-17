-- Rider duty service-type filter (dispatch offer engine)
-- Ensures duty_logs.service_types + related columns exist, backfills vehicle_category,
-- and removes food from 3/4-wheeler riders (vehicles + currently-online duty rows).
-- Idempotent — safe to re-run.
-- Compatible with vehicle_category as TEXT or vehicle_category enum (Auto/Bike/Cab/...).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) duty_logs columns used by service toggle + dispatch engine
-- ---------------------------------------------------------------------------
ALTER TABLE duty_logs
  ADD COLUMN IF NOT EXISTS service_types JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE duty_logs
  ADD COLUMN IF NOT EXISTS vehicle_id BIGINT REFERENCES rider_vehicles(id) ON DELETE SET NULL;

ALTER TABLE duty_logs ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE duty_logs ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;
ALTER TABLE duty_logs ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE duty_logs ADD COLUMN IF NOT EXISTS device_id TEXT;

ALTER TABLE duty_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS duty_logs_vehicle_id_idx ON duty_logs(vehicle_id);

COMMENT ON COLUMN duty_logs.service_types IS
  'JSON array of dispatch services rider is online for: food, parcel, person_ride. Empty when OFF/AUTO_OFF.';

-- ---------------------------------------------------------------------------
-- 2) rider_vehicles columns (0260 may already have run)
-- ---------------------------------------------------------------------------
ALTER TABLE rider_vehicles ADD COLUMN IF NOT EXISTS vehicle_category TEXT;
ALTER TABLE rider_vehicles
  ADD COLUMN IF NOT EXISTS service_types JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 3) Backfill vehicle_category from vehicle_type when missing
--     (handles TEXT column or vehicle_category enum)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_udt_name TEXT;
BEGIN
  SELECT c.udt_name
  INTO v_udt_name
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'rider_vehicles'
    AND c.column_name = 'vehicle_category';

  IF v_udt_name IS NULL THEN
    RETURN;
  END IF;

  IF v_udt_name = 'vehicle_category' THEN
    UPDATE rider_vehicles rv
    SET vehicle_category = CASE
      WHEN rv.vehicle_type::text IN ('bike', 'ev_bike') THEN 'Bike'::vehicle_category
      WHEN rv.vehicle_type::text = 'bicycle' THEN 'Bicycle'::vehicle_category
      WHEN rv.vehicle_type::text = 'scooter' THEN 'Scooter'::vehicle_category
      WHEN rv.vehicle_type::text = 'cycle' THEN 'Bicycle'::vehicle_category
      WHEN rv.vehicle_type::text IN ('auto', 'cng_auto', 'e_rickshaw', 'ev_auto') THEN 'Auto'::vehicle_category
      WHEN rv.vehicle_type::text IN ('car', 'ev_car') THEN 'Cab'::vehicle_category
      WHEN rv.vehicle_type::text = 'taxi' THEN 'Taxi'::vehicle_category
      ELSE rv.vehicle_category
    END
    WHERE rv.vehicle_category IS NULL
       OR btrim(rv.vehicle_category::text) = '';
  ELSE
    UPDATE rider_vehicles rv
    SET vehicle_category = CASE
      WHEN rv.vehicle_type::text IN ('bike', 'bicycle', 'scooter', 'ev_bike', 'cycle') THEN '2_wheeler'
      WHEN rv.vehicle_type::text IN ('auto', 'cng_auto', 'e_rickshaw', 'ev_auto') THEN '3_wheeler'
      WHEN rv.vehicle_type::text IN ('car', 'taxi', 'ev_car') THEN '4_wheeler'
      ELSE rv.vehicle_category
    END
    WHERE rv.vehicle_category IS NULL
       OR btrim(rv.vehicle_category::text) = '';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Remove food from 3/4-wheeler vehicle service_types
-- ---------------------------------------------------------------------------
UPDATE rider_vehicles rv
SET
  service_types = COALESCE(
    (
      SELECT jsonb_agg(elem ORDER BY elem)
      FROM jsonb_array_elements_text(COALESCE(rv.service_types, '[]'::jsonb)) AS elem
      WHERE elem <> 'food'
    ),
    '[]'::jsonb
  ),
  updated_at = NOW()
WHERE (
    rv.vehicle_category::text IN ('3_wheeler', '4_wheeler', 'Auto', 'Cab', 'Taxi')
    OR rv.vehicle_type::text IN ('auto', 'cng_auto', 'e_rickshaw', 'car', 'taxi', 'ev_car', 'ev_auto')
  )
  AND COALESCE(rv.service_types, '[]'::jsonb) @> '["food"]'::jsonb;

-- ---------------------------------------------------------------------------
-- 5) Correct currently-online duty rows that still include food for 3/4W riders
-- ---------------------------------------------------------------------------
WITH latest_duty AS (
  SELECT DISTINCT ON (dl.rider_id)
    dl.rider_id,
    dl.status,
    dl.service_types,
    dl.vehicle_id,
    dl.lat,
    dl.lon,
    dl.session_id,
    dl.device_id,
    dl.metadata
  FROM duty_logs dl
  ORDER BY dl.rider_id, dl.timestamp DESC
),
latest_on AS (
  SELECT *
  FROM latest_duty
  WHERE status = 'ON'
),
rider_food_blocked AS (
  SELECT DISTINCT rv.rider_id
  FROM rider_vehicles rv
  WHERE rv.deleted_at IS NULL
    AND COALESCE(rv.vehicle_active_status, 'active') = 'active'
    AND COALESCE(rv.is_active, true) = true
    AND (
      rv.vehicle_category::text IN ('3_wheeler', '4_wheeler', 'Auto', 'Cab', 'Taxi')
      OR rv.vehicle_type::text IN ('auto', 'cng_auto', 'e_rickshaw', 'car', 'taxi', 'ev_car', 'ev_auto')
    )
),
needs_trim AS (
  SELECT lo.*
  FROM latest_on lo
  INNER JOIN rider_food_blocked rfb ON rfb.rider_id = lo.rider_id
  WHERE COALESCE(lo.service_types, '[]'::jsonb) @> '["food"]'::jsonb
),
trimmed AS (
  SELECT
    nt.rider_id,
    COALESCE(
      (
        SELECT jsonb_agg(elem ORDER BY elem)
        FROM jsonb_array_elements_text(COALESCE(nt.service_types, '[]'::jsonb)) AS elem
        WHERE elem <> 'food'
      ),
      '[]'::jsonb
    ) AS new_service_types,
    nt.vehicle_id,
    nt.lat,
    nt.lon,
    nt.session_id,
    nt.device_id,
    nt.metadata
  FROM needs_trim nt
)
INSERT INTO duty_logs (
  rider_id,
  status,
  service_types,
  vehicle_id,
  lat,
  lon,
  session_id,
  device_id,
  metadata,
  timestamp
)
SELECT
  t.rider_id,
  CASE
    WHEN jsonb_array_length(t.new_service_types) = 0 THEN 'AUTO_OFF'::duty_status
    ELSE 'ON'::duty_status
  END,
  CASE
    WHEN jsonb_array_length(t.new_service_types) = 0 THEN '[]'::jsonb
    ELSE t.new_service_types
  END,
  t.vehicle_id,
  t.lat,
  t.lon,
  t.session_id,
  t.device_id,
  COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object(
    'source', 'system',
    'reason', 'food_removed_3_4_wheeler_migration'
  ),
  NOW()
FROM trimmed t;

COMMIT;
