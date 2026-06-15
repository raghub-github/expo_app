-- Dynamic rider surge engine: unlimited configurable surge types with fixed amounts.
-- Removes legacy per-slab surge_multiplier / surge_max_only from rider pickup slabs.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rider_surge_kind') THEN
    CREATE TYPE rider_surge_kind AS ENUM ('peak_hour', 'rain', 'festival', 'custom');
  END IF;
END
$$;

-- ─── Global surge settings (singleton) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS surge_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  max_total_surge_amount numeric(12, 2) NULL,
  surge_wait_max_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT surge_settings_singleton CHECK (id = 1),
  CONSTRAINT surge_settings_max_surge_nonneg CHECK (max_total_surge_amount IS NULL OR max_total_surge_amount >= 0)
);

INSERT INTO surge_settings (id, max_total_surge_amount, surge_wait_max_only)
VALUES (1, 50, false)
ON CONFLICT (id) DO NOTHING;

-- ─── Surge definitions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS surge_definitions (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  description text NULL,
  kind rider_surge_kind NOT NULL DEFAULT 'custom',
  fixed_amount numeric(12, 2) NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 100,
  is_enabled boolean NOT NULL DEFAULT true,
  gmitra_max_only boolean NOT NULL DEFAULT false,
  applies_food boolean NOT NULL DEFAULT false,
  applies_parcel boolean NOT NULL DEFAULT false,
  applies_ride boolean NOT NULL DEFAULT false,
  vehicle_2_wheeler boolean NOT NULL DEFAULT true,
  vehicle_3_wheeler boolean NOT NULL DEFAULT false,
  vehicle_4_wheeler_ac boolean NOT NULL DEFAULT false,
  vehicle_4_wheeler_non_ac boolean NOT NULL DEFAULT false,
  manual_active boolean NOT NULL DEFAULT false,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT surge_definitions_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT surge_definitions_fixed_amount_nonneg CHECK (fixed_amount >= 0),
  CONSTRAINT surge_definitions_priority_nonneg CHECK (priority >= 0),
  CONSTRAINT surge_definitions_service_required CHECK (
    applies_food OR applies_parcel OR applies_ride
  )
);

CREATE INDEX IF NOT EXISTS surge_definitions_active_idx
  ON surge_definitions (is_enabled, priority DESC, id ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS surge_definitions_kind_idx
  ON surge_definitions (kind)
  WHERE deleted_at IS NULL;

-- ─── Peak-hour time slots ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS surge_time_slots (
  id bigserial PRIMARY KEY,
  surge_id bigint NOT NULL REFERENCES surge_definitions(id) ON DELETE CASCADE,
  start_time time NOT NULL,
  end_time time NOT NULL,
  days_of_week smallint[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6],
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT surge_time_slots_days_valid CHECK (
    cardinality(days_of_week) > 0
    AND days_of_week <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
  )
);

CREATE INDEX IF NOT EXISTS surge_time_slots_surge_idx
  ON surge_time_slots (surge_id, is_enabled);

-- ─── Remove legacy slab surge columns ─────────────────────────────────────────

ALTER TABLE food_rider_pickup_slabs DROP COLUMN IF EXISTS surge_multiplier;
ALTER TABLE food_rider_pickup_slabs DROP COLUMN IF EXISTS surge_max_only;

ALTER TABLE parcel_rider_pickup_slabs DROP COLUMN IF EXISTS surge_multiplier;
ALTER TABLE parcel_rider_pickup_slabs DROP COLUMN IF EXISTS surge_max_only;

ALTER TABLE ride_rider_pickup_slabs DROP COLUMN IF EXISTS surge_multiplier;
ALTER TABLE ride_rider_pickup_slabs DROP COLUMN IF EXISTS surge_max_only;

-- ─── Seed starter surge templates (disabled by default) ───────────────────────

INSERT INTO surge_definitions (
  name, description, kind, fixed_amount, priority, is_enabled,
  applies_food, applies_parcel, applies_ride,
  vehicle_2_wheeler, vehicle_3_wheeler, vehicle_4_wheeler_ac, vehicle_4_wheeler_non_ac,
  manual_active
)
SELECT v.name, v.description, v.kind::rider_surge_kind, v.fixed_amount, v.priority, false,
       true, true, true, true, true, true, true, false
FROM (VALUES
  ('Peak Hour Surge', 'Auto-applies during configured peak time windows', 'peak_hour', 15, 100),
  ('Rain Surge', 'Manual rain surge — future weather API ready', 'rain', 10, 90),
  ('Festival Surge', 'Manual festival / holiday surge', 'festival', 20, 80),
  ('Night Surge', 'Custom night-time rider incentive', 'custom', 12, 70)
) AS v(name, description, kind, fixed_amount, priority)
WHERE NOT EXISTS (SELECT 1 FROM surge_definitions WHERE deleted_at IS NULL LIMIT 1);

-- Default peak-hour slots for Peak Hour Surge template
INSERT INTO surge_time_slots (surge_id, start_time, end_time, days_of_week, is_enabled)
SELECT sd.id, slot.start_time::time, slot.end_time::time, ARRAY[0,1,2,3,4,5,6], true
FROM surge_definitions sd
CROSS JOIN (VALUES
  ('07:00', '10:00'),
  ('17:00', '21:00')
) AS slot(start_time, end_time)
WHERE sd.kind = 'peak_hour' AND sd.name = 'Peak Hour Surge'
  AND NOT EXISTS (SELECT 1 FROM surge_time_slots LIMIT 1);
