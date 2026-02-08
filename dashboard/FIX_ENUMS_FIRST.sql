-- =============================================================================
-- FIX VEHICLE_TYPE ENUM - RUN THIS FIRST!
-- This adds the missing enum values to your database
-- =============================================================================

-- Add missing vehicle_type enum values if they don't exist
DO $$
DECLARE
  v_new_vals TEXT[] := ARRAY['ev_bike', 'cycle', 'cng_auto', 'ev_auto', 'taxi', 'e_rickshaw', 'ev_car', 'other', 'scooter', 'bicycle'];
  v_val TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Check if vehicle_type enum exists
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vehicle_type') THEN
    -- Create the enum with all values
    CREATE TYPE vehicle_type AS ENUM (
      'bike', 'ev_bike', 'cycle', 'scooter', 'bicycle', 'car', 'auto', 'cng_auto', 'ev_auto',
      'taxi', 'e_rickshaw', 'ev_car', 'other'
    );
    RAISE NOTICE '✓ Created vehicle_type enum with all values';
    RETURN;
  END IF;
  
  -- Enum exists, add missing values
  FOREACH v_val IN ARRAY v_new_vals
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'vehicle_type' AND e.enumlabel = v_val
    ) INTO v_exists;
    
    IF NOT v_exists THEN
      BEGIN
        EXECUTE format('ALTER TYPE vehicle_type ADD VALUE %L', v_val);
        RAISE NOTICE '✓ Added value % to vehicle_type enum', v_val;
      EXCEPTION WHEN others THEN
        RAISE NOTICE '⚠ Could not add %: %', v_val, SQLERRM;
      END;
    ELSE
      RAISE NOTICE '  Value % already exists', v_val;
    END IF;
  END LOOP;
END $$;

-- Show all current vehicle_type values
SELECT enumlabel AS vehicle_type_value
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'vehicle_type'
ORDER BY e.enumsortorder;

RAISE NOTICE '';
RAISE NOTICE '========================================';
RAISE NOTICE '✓ vehicle_type enum is now ready!';
RAISE NOTICE 'Run FINAL_SQL_SCRIPT.sql next';
RAISE NOTICE '========================================';
