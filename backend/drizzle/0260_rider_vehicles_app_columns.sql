-- Ensure rider_vehicles columns used by rider app vehicle upsert exist (idempotent)
ALTER TABLE rider_vehicles ADD COLUMN IF NOT EXISTS vehicle_number TEXT;
ALTER TABLE rider_vehicles ADD COLUMN IF NOT EXISTS fuel_type TEXT;
ALTER TABLE rider_vehicles ADD COLUMN IF NOT EXISTS vehicle_category TEXT;
ALTER TABLE rider_vehicles ADD COLUMN IF NOT EXISTS ac_type TEXT;
ALTER TABLE rider_vehicles ADD COLUMN IF NOT EXISTS service_types JSONB DEFAULT '[]'::jsonb;
ALTER TABLE rider_vehicles ADD COLUMN IF NOT EXISTS is_commercial BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE rider_vehicles ADD COLUMN IF NOT EXISTS registration_state TEXT;
ALTER TABLE rider_vehicles ADD COLUMN IF NOT EXISTS ownership_type TEXT;
ALTER TABLE rider_vehicles ADD COLUMN IF NOT EXISTS seating_capacity INTEGER;
ALTER TABLE rider_vehicles ADD COLUMN IF NOT EXISTS vehicle_active_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE rider_vehicles ADD COLUMN IF NOT EXISTS limitation_flags JSONB DEFAULT '{}'::jsonb;
ALTER TABLE rider_vehicles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Extend vehicle_type enum for app options (ignore if already present)
DO $$
DECLARE
  v_val TEXT;
  v_vals TEXT[] := ARRAY['taxi', 'e_rickshaw', 'ev_car'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vehicle_type') THEN
    RETURN;
  END IF;
  FOREACH v_val IN ARRAY v_vals
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'vehicle_type' AND e.enumlabel = v_val
    ) THEN
      EXECUTE format('ALTER TYPE vehicle_type ADD VALUE %L', v_val);
    END IF;
  END LOOP;
END $$;
