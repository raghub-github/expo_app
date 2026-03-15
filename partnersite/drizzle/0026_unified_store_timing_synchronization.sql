-- ============================================================================
-- UNIFIED STORE TIMING SYNCHRONIZATION MIGRATION
-- Ensures single source of truth for store schedule, off-days, closures, and auto-open logic
-- Migration: 0026_unified_store_timing_synchronization
-- ============================================================================

-- ============================================================================
-- PART 1: ENSURE merchant_store_operating_hours TABLE STRUCTURE
-- ============================================================================

-- Ensure closed_days column exists and is properly typed
DO $$
BEGIN
  -- Add closed_days column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'merchant_store_operating_hours' 
      AND column_name = 'closed_days'
  ) THEN
    ALTER TABLE public.merchant_store_operating_hours
      ADD COLUMN closed_days text[] DEFAULT NULL;
  END IF;
  
  -- Ensure it's text[] type (not jsonb or other)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'merchant_store_operating_hours' 
      AND column_name = 'closed_days'
      AND udt_name != '_text'
  ) THEN
    -- Convert to text[] if needed
    ALTER TABLE public.merchant_store_operating_hours
      ALTER COLUMN closed_days TYPE text[] USING 
        CASE 
          WHEN closed_days IS NULL THEN NULL
          WHEN jsonb_typeof(closed_days::jsonb) = 'array' THEN 
            ARRAY(SELECT jsonb_array_elements_text(closed_days::jsonb))
          ELSE NULL
        END;
  END IF;
END $$;

-- Ensure all required columns exist
ALTER TABLE public.merchant_store_operating_hours
  ADD COLUMN IF NOT EXISTS same_for_all_days boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_24_hours boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_by_email text,
  ADD COLUMN IF NOT EXISTS updated_by_at timestamp with time zone DEFAULT now();

-- Ensure all day columns exist with proper defaults
DO $$
DECLARE
  days text[] := ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  day text;
BEGIN
  FOREACH day IN ARRAY days
  LOOP
    -- Ensure _open column exists
    EXECUTE format('ALTER TABLE public.merchant_store_operating_hours ADD COLUMN IF NOT EXISTS %I_open boolean NOT NULL DEFAULT false', day);
    
    -- Ensure slot columns exist
    EXECUTE format('ALTER TABLE public.merchant_store_operating_hours ADD COLUMN IF NOT EXISTS %I_slot1_start time without time zone', day);
    EXECUTE format('ALTER TABLE public.merchant_store_operating_hours ADD COLUMN IF NOT EXISTS %I_slot1_end time without time zone', day);
    EXECUTE format('ALTER TABLE public.merchant_store_operating_hours ADD COLUMN IF NOT EXISTS %I_slot2_start time without time zone', day);
    EXECUTE format('ALTER TABLE public.merchant_store_operating_hours ADD COLUMN IF NOT EXISTS %I_slot2_end time without time zone', day);
    EXECUTE format('ALTER TABLE public.merchant_store_operating_hours ADD COLUMN IF NOT EXISTS %I_total_duration_minutes integer DEFAULT 0', day);
  END LOOP;
END $$;

-- ============================================================================
-- PART 2: ENSURE merchant_store_availability TABLE STRUCTURE
-- ============================================================================

-- Ensure block_auto_open exists with proper default
ALTER TABLE public.merchant_store_availability
  ADD COLUMN IF NOT EXISTS block_auto_open boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS restriction_type text,
  ADD COLUMN IF NOT EXISTS manual_close_until timestamp with time zone,
  ADD COLUMN IF NOT EXISTS auto_open_from_schedule boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_toggled_by_email text,
  ADD COLUMN IF NOT EXISTS last_toggled_by_name text,
  ADD COLUMN IF NOT EXISTS last_toggled_by_id text,
  ADD COLUMN IF NOT EXISTS last_toggle_type text,
  ADD COLUMN IF NOT EXISTS last_toggled_at timestamp with time zone;

-- Update any NULL block_auto_open to false
UPDATE public.merchant_store_availability
SET block_auto_open = false
WHERE block_auto_open IS NULL;

-- Ensure NOT NULL constraint on block_auto_open
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'merchant_store_availability' 
      AND column_name = 'block_auto_open'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.merchant_store_availability
      ALTER COLUMN block_auto_open SET NOT NULL,
      ALTER COLUMN block_auto_open SET DEFAULT false;
  END IF;
END $$;

-- ============================================================================
-- PART 3: CREATE SYNCHRONIZATION FUNCTION
-- ============================================================================

-- Function to sync closed_days array with individual day _open flags
CREATE OR REPLACE FUNCTION sync_operating_hours_closed_days()
RETURNS TRIGGER AS $$
DECLARE
  closed_list text[] := ARRAY[]::text[];
BEGIN
  -- Build closed_days array from _open flags using CASE statements
  -- Check each day explicitly
  IF NOT NEW.monday_open THEN closed_list := array_append(closed_list, 'monday'); END IF;
  IF NOT NEW.tuesday_open THEN closed_list := array_append(closed_list, 'tuesday'); END IF;
  IF NOT NEW.wednesday_open THEN closed_list := array_append(closed_list, 'wednesday'); END IF;
  IF NOT NEW.thursday_open THEN closed_list := array_append(closed_list, 'thursday'); END IF;
  IF NOT NEW.friday_open THEN closed_list := array_append(closed_list, 'friday'); END IF;
  IF NOT NEW.saturday_open THEN closed_list := array_append(closed_list, 'saturday'); END IF;
  IF NOT NEW.sunday_open THEN closed_list := array_append(closed_list, 'sunday'); END IF;
  
  -- Update closed_days array
  NEW.closed_days := CASE WHEN array_length(closed_list, 1) > 0 THEN closed_list ELSE NULL END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-sync closed_days when _open flags change
DROP TRIGGER IF EXISTS sync_closed_days_trigger ON public.merchant_store_operating_hours;
CREATE TRIGGER sync_closed_days_trigger
  BEFORE INSERT OR UPDATE ON public.merchant_store_operating_hours
  FOR EACH ROW
  EXECUTE FUNCTION sync_operating_hours_closed_days();

-- ============================================================================
-- PART 4: CREATE FUNCTION TO SYNC merchant_store_availability WITH SCHEDULE
-- ============================================================================

-- Function to ensure merchant_store_availability respects scheduled closed days
CREATE OR REPLACE FUNCTION sync_availability_with_schedule()
RETURNS TRIGGER AS $$
DECLARE
  oh_record RECORD;
  current_day text;
  day_names text[] := ARRAY['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  day_index int;
  is_closed boolean := false;
BEGIN
  -- Get current day of week (0=Sunday, 6=Saturday)
  day_index := EXTRACT(DOW FROM NOW());
  current_day := day_names[day_index + 1];
  
  -- Get operating hours for this store
  SELECT * INTO oh_record
  FROM public.merchant_store_operating_hours
  WHERE store_id = NEW.store_id
  LIMIT 1;
  
  IF oh_record IS NOT NULL THEN
    -- Check if today is in closed_days array
    IF oh_record.closed_days IS NOT NULL AND current_day = ANY(oh_record.closed_days) THEN
      is_closed := true;
    ELSE
      -- Check if today's _open flag is false using CASE expression
      is_closed := CASE current_day
        WHEN 'monday' THEN NOT oh_record.monday_open
        WHEN 'tuesday' THEN NOT oh_record.tuesday_open
        WHEN 'wednesday' THEN NOT oh_record.wednesday_open
        WHEN 'thursday' THEN NOT oh_record.thursday_open
        WHEN 'friday' THEN NOT oh_record.friday_open
        WHEN 'saturday' THEN NOT oh_record.saturday_open
        WHEN 'sunday' THEN NOT oh_record.sunday_open
        ELSE false
      END;
    END IF;
    
    -- If today is scheduled closed and store is OPEN, auto-close it
    IF is_closed AND NEW.is_available = true AND NEW.restriction_type IS NULL THEN
      NEW.is_available := false;
      NEW.is_accepting_orders := false;
      NEW.restriction_type := 'SCHEDULED_CLOSED';
      NEW.last_toggle_type := 'AUTO_CLOSE_SCHEDULE';
      NEW.last_toggled_at := NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (only if not exists)
DROP TRIGGER IF EXISTS sync_availability_schedule_trigger ON public.merchant_store_availability;
CREATE TRIGGER sync_availability_schedule_trigger
  BEFORE INSERT OR UPDATE ON public.merchant_store_availability
  FOR EACH ROW
  EXECUTE FUNCTION sync_availability_with_schedule();

-- ============================================================================
-- PART 5: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Indexes for operating hours queries
CREATE INDEX IF NOT EXISTS merchant_store_operating_hours_closed_days_idx 
  ON public.merchant_store_operating_hours USING GIN(closed_days)
  WHERE closed_days IS NOT NULL;

CREATE INDEX IF NOT EXISTS merchant_store_operating_hours_store_updated_idx 
  ON public.merchant_store_operating_hours(store_id, updated_by_at DESC);

-- Indexes for availability queries
CREATE INDEX IF NOT EXISTS merchant_store_availability_block_auto_open_idx 
  ON public.merchant_store_availability(store_id) 
  WHERE block_auto_open = true;

CREATE INDEX IF NOT EXISTS merchant_store_availability_restriction_idx 
  ON public.merchant_store_availability(store_id, restriction_type)
  WHERE restriction_type IS NOT NULL;

-- ============================================================================
-- PART 6: DATA INTEGRITY CHECKS AND CLEANUP
-- ============================================================================

-- Sync existing closed_days arrays with _open flags
DO $$
DECLARE
  rec RECORD;
  closed_list text[] := ARRAY[]::text[];
BEGIN
  FOR rec IN SELECT * FROM public.merchant_store_operating_hours
  LOOP
    closed_list := ARRAY[]::text[];
    
    -- Check each day explicitly
    IF NOT rec.monday_open THEN closed_list := array_append(closed_list, 'monday'); END IF;
    IF NOT rec.tuesday_open THEN closed_list := array_append(closed_list, 'tuesday'); END IF;
    IF NOT rec.wednesday_open THEN closed_list := array_append(closed_list, 'wednesday'); END IF;
    IF NOT rec.thursday_open THEN closed_list := array_append(closed_list, 'thursday'); END IF;
    IF NOT rec.friday_open THEN closed_list := array_append(closed_list, 'friday'); END IF;
    IF NOT rec.saturday_open THEN closed_list := array_append(closed_list, 'saturday'); END IF;
    IF NOT rec.sunday_open THEN closed_list := array_append(closed_list, 'sunday'); END IF;
    
    UPDATE public.merchant_store_operating_hours
    SET closed_days = CASE WHEN array_length(closed_list, 1) > 0 THEN closed_list ELSE NULL END
    WHERE id = rec.id;
  END LOOP;
END $$;

-- Ensure all stores have availability rows
INSERT INTO public.merchant_store_availability (store_id, is_available, is_accepting_orders, block_auto_open, auto_open_from_schedule)
SELECT id, false, false, false, true
FROM public.merchant_stores
WHERE id NOT IN (SELECT store_id FROM public.merchant_store_availability)
ON CONFLICT (store_id) DO NOTHING;

-- ============================================================================
-- PART 7: COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN public.merchant_store_operating_hours.closed_days IS 
  'Array of day names (monday, tuesday, etc.) when store is scheduled closed. Auto-synced with _open flags via trigger.';

COMMENT ON COLUMN public.merchant_store_operating_hours.same_for_all_days IS 
  'If true, all days use the same schedule as Monday.';

COMMENT ON COLUMN public.merchant_store_operating_hours.is_24_hours IS 
  'If true, store is open 24 hours on all open days.';

COMMENT ON COLUMN public.merchant_store_availability.block_auto_open IS 
  'When true, store must NOT auto-open on schedule; only manual turn ON opens. Default: false.';

COMMENT ON COLUMN public.merchant_store_availability.restriction_type IS 
  'Type of closure: TEMPORARY, CLOSED_TODAY, MANUAL_HOLD, SCHEDULED_CLOSED.';

COMMENT ON FUNCTION sync_operating_hours_closed_days() IS 
  'Auto-syncs closed_days array with individual day _open flags whenever operating hours are updated.';

COMMENT ON FUNCTION sync_availability_with_schedule() IS 
  'Auto-closes store in merchant_store_availability if current day is scheduled closed in operating hours.';
