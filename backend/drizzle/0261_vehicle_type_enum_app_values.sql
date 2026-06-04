-- Align vehicle_type enum with rider app options
DO $$
DECLARE
  v_val TEXT;
  v_vals TEXT[] := ARRAY['other', 'ev_bike', 'cycle', 'cng_auto', 'ev_auto'];
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
