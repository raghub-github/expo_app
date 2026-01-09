-- ============================================================================
-- REDESIGN OPERATING HOURS TABLE - Single Row Per Store
-- Migration: 0037_redesign_operating_hours_single_row
-- Database: Supabase PostgreSQL
-- 
-- This migration redesigns merchant_store_operating_hours to store
-- all days of the week in a single row per store instead of 7 rows.
-- ============================================================================

-- ============================================================================
-- STEP 1: CREATE NEW TABLE STRUCTURE
-- ============================================================================

-- Create new table with all days in one row
CREATE TABLE IF NOT EXISTS merchant_store_operating_hours_new (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL UNIQUE REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- Monday
  monday_open BOOLEAN NOT NULL DEFAULT FALSE,
  monday_slot1_start TIME,
  monday_slot1_end TIME,
  monday_slot2_start TIME,
  monday_slot2_end TIME,
  monday_total_duration_minutes INTEGER DEFAULT 0,
  
  -- Tuesday
  tuesday_open BOOLEAN NOT NULL DEFAULT FALSE,
  tuesday_slot1_start TIME,
  tuesday_slot1_end TIME,
  tuesday_slot2_start TIME,
  tuesday_slot2_end TIME,
  tuesday_total_duration_minutes INTEGER DEFAULT 0,
  
  -- Wednesday
  wednesday_open BOOLEAN NOT NULL DEFAULT FALSE,
  wednesday_slot1_start TIME,
  wednesday_slot1_end TIME,
  wednesday_slot2_start TIME,
  wednesday_slot2_end TIME,
  wednesday_total_duration_minutes INTEGER DEFAULT 0,
  
  -- Thursday
  thursday_open BOOLEAN NOT NULL DEFAULT FALSE,
  thursday_slot1_start TIME,
  thursday_slot1_end TIME,
  thursday_slot2_start TIME,
  thursday_slot2_end TIME,
  thursday_total_duration_minutes INTEGER DEFAULT 0,
  
  -- Friday
  friday_open BOOLEAN NOT NULL DEFAULT FALSE,
  friday_slot1_start TIME,
  friday_slot1_end TIME,
  friday_slot2_start TIME,
  friday_slot2_end TIME,
  friday_total_duration_minutes INTEGER DEFAULT 0,
  
  -- Saturday
  saturday_open BOOLEAN NOT NULL DEFAULT FALSE,
  saturday_slot1_start TIME,
  saturday_slot1_end TIME,
  saturday_slot2_start TIME,
  saturday_slot2_end TIME,
  saturday_total_duration_minutes INTEGER DEFAULT 0,
  
  -- Sunday
  sunday_open BOOLEAN NOT NULL DEFAULT FALSE,
  sunday_slot1_start TIME,
  sunday_slot1_end TIME,
  sunday_slot2_start TIME,
  sunday_slot2_end TIME,
  sunday_total_duration_minutes INTEGER DEFAULT 0,
  
  -- Global Settings
  is_24_hours BOOLEAN DEFAULT FALSE,
  same_for_all_days BOOLEAN DEFAULT FALSE,
  closed_days TEXT[], -- Array of days that are closed (e.g., ['SUNDAY'])
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- STEP 2: MIGRATE EXISTING DATA
-- ============================================================================

-- Migrate data from old table (7 rows per store) to new table (1 row per store)
-- Only migrate if old table exists and has data
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'merchant_store_operating_hours'
  ) THEN
    INSERT INTO merchant_store_operating_hours_new (
  store_id,
  monday_open, monday_slot1_start, monday_slot1_end, monday_slot2_start, monday_slot2_end, monday_total_duration_minutes,
  tuesday_open, tuesday_slot1_start, tuesday_slot1_end, tuesday_slot2_start, tuesday_slot2_end, tuesday_total_duration_minutes,
  wednesday_open, wednesday_slot1_start, wednesday_slot1_end, wednesday_slot2_start, wednesday_slot2_end, wednesday_total_duration_minutes,
  thursday_open, thursday_slot1_start, thursday_slot1_end, thursday_slot2_start, thursday_slot2_end, thursday_total_duration_minutes,
  friday_open, friday_slot1_start, friday_slot1_end, friday_slot2_start, friday_slot2_end, friday_total_duration_minutes,
  saturday_open, saturday_slot1_start, saturday_slot1_end, saturday_slot2_start, saturday_slot2_end, saturday_total_duration_minutes,
  sunday_open, sunday_slot1_start, sunday_slot1_end, sunday_slot2_start, sunday_slot2_end, sunday_total_duration_minutes,
  is_24_hours, same_for_all_days, created_at, updated_at
)
SELECT 
  store_id,
  -- Monday
  BOOL_OR(CASE WHEN day_of_week = 'MONDAY' THEN is_open ELSE FALSE END),
  MAX(CASE WHEN day_of_week = 'MONDAY' THEN slot1_start END),
  MAX(CASE WHEN day_of_week = 'MONDAY' THEN slot1_end END),
  MAX(CASE WHEN day_of_week = 'MONDAY' THEN slot2_start END),
  MAX(CASE WHEN day_of_week = 'MONDAY' THEN slot2_end END),
  COALESCE(MAX(CASE WHEN day_of_week = 'MONDAY' THEN total_duration_minutes END), 0),
  -- Tuesday
  BOOL_OR(CASE WHEN day_of_week = 'TUESDAY' THEN is_open ELSE FALSE END),
  MAX(CASE WHEN day_of_week = 'TUESDAY' THEN slot1_start END),
  MAX(CASE WHEN day_of_week = 'TUESDAY' THEN slot1_end END),
  MAX(CASE WHEN day_of_week = 'TUESDAY' THEN slot2_start END),
  MAX(CASE WHEN day_of_week = 'TUESDAY' THEN slot2_end END),
  COALESCE(MAX(CASE WHEN day_of_week = 'TUESDAY' THEN total_duration_minutes END), 0),
  -- Wednesday
  BOOL_OR(CASE WHEN day_of_week = 'WEDNESDAY' THEN is_open ELSE FALSE END),
  MAX(CASE WHEN day_of_week = 'WEDNESDAY' THEN slot1_start END),
  MAX(CASE WHEN day_of_week = 'WEDNESDAY' THEN slot1_end END),
  MAX(CASE WHEN day_of_week = 'WEDNESDAY' THEN slot2_start END),
  MAX(CASE WHEN day_of_week = 'WEDNESDAY' THEN slot2_end END),
  COALESCE(MAX(CASE WHEN day_of_week = 'WEDNESDAY' THEN total_duration_minutes END), 0),
  -- Thursday
  BOOL_OR(CASE WHEN day_of_week = 'THURSDAY' THEN is_open ELSE FALSE END),
  MAX(CASE WHEN day_of_week = 'THURSDAY' THEN slot1_start END),
  MAX(CASE WHEN day_of_week = 'THURSDAY' THEN slot1_end END),
  MAX(CASE WHEN day_of_week = 'THURSDAY' THEN slot2_start END),
  MAX(CASE WHEN day_of_week = 'THURSDAY' THEN slot2_end END),
  COALESCE(MAX(CASE WHEN day_of_week = 'THURSDAY' THEN total_duration_minutes END), 0),
  -- Friday
  BOOL_OR(CASE WHEN day_of_week = 'FRIDAY' THEN is_open ELSE FALSE END),
  MAX(CASE WHEN day_of_week = 'FRIDAY' THEN slot1_start END),
  MAX(CASE WHEN day_of_week = 'FRIDAY' THEN slot1_end END),
  MAX(CASE WHEN day_of_week = 'FRIDAY' THEN slot2_start END),
  MAX(CASE WHEN day_of_week = 'FRIDAY' THEN slot2_end END),
  COALESCE(MAX(CASE WHEN day_of_week = 'FRIDAY' THEN total_duration_minutes END), 0),
  -- Saturday
  BOOL_OR(CASE WHEN day_of_week = 'SATURDAY' THEN is_open ELSE FALSE END),
  MAX(CASE WHEN day_of_week = 'SATURDAY' THEN slot1_start END),
  MAX(CASE WHEN day_of_week = 'SATURDAY' THEN slot1_end END),
  MAX(CASE WHEN day_of_week = 'SATURDAY' THEN slot2_start END),
  MAX(CASE WHEN day_of_week = 'SATURDAY' THEN slot2_end END),
  COALESCE(MAX(CASE WHEN day_of_week = 'SATURDAY' THEN total_duration_minutes END), 0),
  -- Sunday
  BOOL_OR(CASE WHEN day_of_week = 'SUNDAY' THEN is_open ELSE FALSE END),
  MAX(CASE WHEN day_of_week = 'SUNDAY' THEN slot1_start END),
  MAX(CASE WHEN day_of_week = 'SUNDAY' THEN slot1_end END),
  MAX(CASE WHEN day_of_week = 'SUNDAY' THEN slot2_start END),
  MAX(CASE WHEN day_of_week = 'SUNDAY' THEN slot2_end END),
  COALESCE(MAX(CASE WHEN day_of_week = 'SUNDAY' THEN total_duration_minutes END), 0),
  -- Global settings (take from any row, they should be same)
  BOOL_OR(is_24_hours),
  BOOL_OR(same_for_all_days),
  MIN(created_at) AS created_at,
  MAX(updated_at) AS updated_at
FROM merchant_store_operating_hours
GROUP BY store_id
ON CONFLICT (store_id) DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- STEP 3: DROP OLD TABLE AND RENAME NEW TABLE
-- ============================================================================

-- Drop old table (cascade will handle dependent objects)
DROP TABLE IF EXISTS merchant_store_operating_hours CASCADE;

-- Rename new table to original name
ALTER TABLE merchant_store_operating_hours_new 
  RENAME TO merchant_store_operating_hours;

-- ============================================================================
-- STEP 4: CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS merchant_store_operating_hours_store_id_idx 
  ON merchant_store_operating_hours(store_id);

-- Index for stores that are open on specific days
CREATE INDEX IF NOT EXISTS merchant_store_operating_hours_monday_open_idx 
  ON merchant_store_operating_hours(store_id) WHERE monday_open = TRUE;

CREATE INDEX IF NOT EXISTS merchant_store_operating_hours_tuesday_open_idx 
  ON merchant_store_operating_hours(store_id) WHERE tuesday_open = TRUE;

CREATE INDEX IF NOT EXISTS merchant_store_operating_hours_wednesday_open_idx 
  ON merchant_store_operating_hours(store_id) WHERE wednesday_open = TRUE;

CREATE INDEX IF NOT EXISTS merchant_store_operating_hours_thursday_open_idx 
  ON merchant_store_operating_hours(store_id) WHERE thursday_open = TRUE;

CREATE INDEX IF NOT EXISTS merchant_store_operating_hours_friday_open_idx 
  ON merchant_store_operating_hours(store_id) WHERE friday_open = TRUE;

CREATE INDEX IF NOT EXISTS merchant_store_operating_hours_saturday_open_idx 
  ON merchant_store_operating_hours(store_id) WHERE saturday_open = TRUE;

CREATE INDEX IF NOT EXISTS merchant_store_operating_hours_sunday_open_idx 
  ON merchant_store_operating_hours(store_id) WHERE sunday_open = TRUE;

-- Index for 24/7 stores
CREATE INDEX IF NOT EXISTS merchant_store_operating_hours_24_hours_idx 
  ON merchant_store_operating_hours(store_id) WHERE is_24_hours = TRUE;

-- ============================================================================
-- STEP 5: CREATE TRIGGERS
-- ============================================================================

-- Trigger: Auto-update updated_at
DROP TRIGGER IF EXISTS merchant_store_operating_hours_updated_at_trigger ON merchant_store_operating_hours;
CREATE TRIGGER merchant_store_operating_hours_updated_at_trigger
  BEFORE UPDATE ON merchant_store_operating_hours
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- STEP 6: ADD HELPER FUNCTIONS (Optional but useful)
-- ============================================================================

-- Function: Get operating hours for a specific day
CREATE OR REPLACE FUNCTION get_store_operating_hours_for_day(
  p_store_id BIGINT,
  p_day day_of_week
)
RETURNS TABLE (
  is_open BOOLEAN,
  slot1_start TIME,
  slot1_end TIME,
  slot2_start TIME,
  slot2_end TIME,
  total_duration_minutes INTEGER,
  is_24_hours BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE p_day
      WHEN 'MONDAY' THEN osh.monday_open
      WHEN 'TUESDAY' THEN osh.tuesday_open
      WHEN 'WEDNESDAY' THEN osh.wednesday_open
      WHEN 'THURSDAY' THEN osh.thursday_open
      WHEN 'FRIDAY' THEN osh.friday_open
      WHEN 'SATURDAY' THEN osh.saturday_open
      WHEN 'SUNDAY' THEN osh.sunday_open
    END AS is_open,
    CASE p_day
      WHEN 'MONDAY' THEN osh.monday_slot1_start
      WHEN 'TUESDAY' THEN osh.tuesday_slot1_start
      WHEN 'WEDNESDAY' THEN osh.wednesday_slot1_start
      WHEN 'THURSDAY' THEN osh.thursday_slot1_start
      WHEN 'FRIDAY' THEN osh.friday_slot1_start
      WHEN 'SATURDAY' THEN osh.saturday_slot1_start
      WHEN 'SUNDAY' THEN osh.sunday_slot1_start
    END AS slot1_start,
    CASE p_day
      WHEN 'MONDAY' THEN osh.monday_slot1_end
      WHEN 'TUESDAY' THEN osh.tuesday_slot1_end
      WHEN 'WEDNESDAY' THEN osh.wednesday_slot1_end
      WHEN 'THURSDAY' THEN osh.thursday_slot1_end
      WHEN 'FRIDAY' THEN osh.friday_slot1_end
      WHEN 'SATURDAY' THEN osh.saturday_slot1_end
      WHEN 'SUNDAY' THEN osh.sunday_slot1_end
    END AS slot1_end,
    CASE p_day
      WHEN 'MONDAY' THEN osh.monday_slot2_start
      WHEN 'TUESDAY' THEN osh.tuesday_slot2_start
      WHEN 'WEDNESDAY' THEN osh.wednesday_slot2_start
      WHEN 'THURSDAY' THEN osh.thursday_slot2_start
      WHEN 'FRIDAY' THEN osh.friday_slot2_start
      WHEN 'SATURDAY' THEN osh.saturday_slot2_start
      WHEN 'SUNDAY' THEN osh.sunday_slot2_start
    END AS slot2_start,
    CASE p_day
      WHEN 'MONDAY' THEN osh.monday_slot2_end
      WHEN 'TUESDAY' THEN osh.tuesday_slot2_end
      WHEN 'WEDNESDAY' THEN osh.wednesday_slot2_end
      WHEN 'THURSDAY' THEN osh.thursday_slot2_end
      WHEN 'FRIDAY' THEN osh.friday_slot2_end
      WHEN 'SATURDAY' THEN osh.saturday_slot2_end
      WHEN 'SUNDAY' THEN osh.sunday_slot2_end
    END AS slot2_end,
    CASE p_day
      WHEN 'MONDAY' THEN osh.monday_total_duration_minutes
      WHEN 'TUESDAY' THEN osh.tuesday_total_duration_minutes
      WHEN 'WEDNESDAY' THEN osh.wednesday_total_duration_minutes
      WHEN 'THURSDAY' THEN osh.thursday_total_duration_minutes
      WHEN 'FRIDAY' THEN osh.friday_total_duration_minutes
      WHEN 'SATURDAY' THEN osh.saturday_total_duration_minutes
      WHEN 'SUNDAY' THEN osh.sunday_total_duration_minutes
    END AS total_duration_minutes,
    osh.is_24_hours
  FROM merchant_store_operating_hours osh
  WHERE osh.store_id = p_store_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 7: RE-ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE merchant_store_operating_hours ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 8: COMMENTS
-- ============================================================================

COMMENT ON TABLE merchant_store_operating_hours IS 'Store operating hours - all days stored in a single row per store';
COMMENT ON COLUMN merchant_store_operating_hours.store_id IS 'Reference to merchant store. One row per store.';
COMMENT ON COLUMN merchant_store_operating_hours.is_24_hours IS 'If TRUE, store is open 24/7 and slot times are ignored';
COMMENT ON COLUMN merchant_store_operating_hours.same_for_all_days IS 'If TRUE, merchant can set hours once and apply to all days';
COMMENT ON COLUMN merchant_store_operating_hours.closed_days IS 'Array of days that are permanently closed (e.g., ["SUNDAY"])';
COMMENT ON FUNCTION get_store_operating_hours_for_day IS 'Returns operating hours for a specific day of the week for a store';
