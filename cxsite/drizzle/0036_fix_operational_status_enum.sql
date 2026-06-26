-- ============================================================================
-- FIX OPERATIONAL STATUS ENUM - Remove ACTIVE/INACTIVE, Convert Column to Enum
-- Migration: 0036_fix_operational_status_enum
-- Database: Supabase PostgreSQL
-- 
-- This migration:
-- 1. Creates a new clean enum with only OPEN and CLOSED
-- 2. Converts operational_status column from TEXT to enum type
-- 3. This enables dropdown in Supabase UI
-- ============================================================================

-- ============================================================================
-- STEP 1: CREATE NEW CLEAN ENUM (Only OPEN and CLOSED)
-- ============================================================================

-- Create a new enum with only OPEN and CLOSED
DO $$
BEGIN
  -- Create new enum if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_operational_status_new') THEN
    CREATE TYPE store_operational_status_new AS ENUM ('OPEN', 'CLOSED');
  END IF;
END $$;

-- ============================================================================
-- STEP 2: CONVERT COLUMN TO NEW ENUM TYPE
-- ============================================================================

-- Step 1: Drop dependent triggers first
DROP TRIGGER IF EXISTS merchant_stores_status_history_trigger ON merchant_stores;

-- Step 2: Drop default first (it's TEXT and can't be cast to enum)
ALTER TABLE merchant_stores
  ALTER COLUMN operational_status DROP DEFAULT;

-- Step 3: Add temporary column with new enum type
ALTER TABLE merchant_stores 
  ADD COLUMN operational_status_new store_operational_status_new;

-- Step 4: Populate temporary column based on text values
UPDATE merchant_stores
SET operational_status_new = CASE 
  WHEN operational_status::text = 'OPEN' THEN 'OPEN'::store_operational_status_new
  WHEN operational_status::text = 'CLOSED' THEN 'CLOSED'::store_operational_status_new
  WHEN operational_status::text = 'ACTIVE' THEN 'OPEN'::store_operational_status_new
  WHEN operational_status::text = 'INACTIVE' THEN 'CLOSED'::store_operational_status_new
  ELSE 'CLOSED'::store_operational_status_new
END;

-- Step 5: Drop old column and rename new one
ALTER TABLE merchant_stores 
  DROP COLUMN operational_status;

ALTER TABLE merchant_stores 
  RENAME COLUMN operational_status_new TO operational_status;

-- Step 6: Rename the enum type (swap old and new)
-- First, check if old enum exists and rename it
DO $$
BEGIN
  -- Check if old enum exists (the one with ACTIVE, INACTIVE, OPEN, CLOSED)
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_operational_status') THEN
    -- Check if it's different from the new one
    IF EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'store_operational_status')
      AND enumlabel IN ('ACTIVE', 'INACTIVE')
    ) THEN
      -- It's the old enum with ACTIVE/INACTIVE, rename it
      ALTER TYPE store_operational_status RENAME TO store_operational_status_old;
    END IF;
  END IF;
END $$;

-- Rename new enum to the standard name
ALTER TYPE store_operational_status_new RENAME TO store_operational_status;

-- Step 6: Set default (now that column is enum type)
ALTER TABLE merchant_stores
  ALTER COLUMN operational_status 
  SET DEFAULT 'CLOSED'::store_operational_status;

-- Step 7: Drop the old enum (optional - can keep for reference)
-- DROP TYPE IF EXISTS store_operational_status_old;

-- Step 8: Drop the text-based CHECK constraint (no longer needed)
ALTER TABLE merchant_stores
  DROP CONSTRAINT IF EXISTS operational_status_check;

-- ============================================================================
-- STEP 3: UPDATE STATUS HISTORY TABLE COLUMNS (Drop defaults first)
-- ============================================================================

-- Drop defaults from status_history columns if they exist
ALTER TABLE merchant_store_status_history
  ALTER COLUMN from_operational_status DROP DEFAULT;

ALTER TABLE merchant_store_status_history
  ALTER COLUMN to_operational_status DROP DEFAULT;

-- Update status_history table columns to use new enum
ALTER TABLE merchant_store_status_history
  ALTER COLUMN from_operational_status 
  TYPE store_operational_status 
  USING (
    CASE from_operational_status::text
      WHEN 'OPEN' THEN 'OPEN'::store_operational_status
      WHEN 'CLOSED' THEN 'CLOSED'::store_operational_status
      WHEN 'ACTIVE' THEN 'OPEN'::store_operational_status
      WHEN 'INACTIVE' THEN 'CLOSED'::store_operational_status
      ELSE 'CLOSED'::store_operational_status
    END
  );

ALTER TABLE merchant_store_status_history
  ALTER COLUMN to_operational_status 
  TYPE store_operational_status 
  USING (
    CASE to_operational_status::text
      WHEN 'OPEN' THEN 'OPEN'::store_operational_status
      WHEN 'CLOSED' THEN 'CLOSED'::store_operational_status
      WHEN 'ACTIVE' THEN 'OPEN'::store_operational_status
      WHEN 'INACTIVE' THEN 'CLOSED'::store_operational_status
      ELSE 'CLOSED'::store_operational_status
    END
  );

-- ============================================================================
-- STEP 4: RECREATE TRIGGERS
-- ============================================================================

-- Recreate status_history trigger
DROP TRIGGER IF EXISTS merchant_stores_status_history_trigger ON merchant_stores;
CREATE TRIGGER merchant_stores_status_history_trigger
  AFTER UPDATE OF approval_status, operational_status ON merchant_stores
  FOR EACH ROW
  WHEN (
    OLD.approval_status IS DISTINCT FROM NEW.approval_status 
    OR OLD.operational_status IS DISTINCT FROM NEW.operational_status
  )
  EXECUTE FUNCTION create_merchant_store_status_history();

-- ============================================================================
-- STEP 5: UPDATE FUNCTION TO HANDLE ENUM PROPERLY
-- ============================================================================

-- Update the function to work with enum type (no need for casting now)
CREATE OR REPLACE FUNCTION create_merchant_store_status_history()
RETURNS TRIGGER AS $$
DECLARE
  v_has_new_columns BOOLEAN;
BEGIN
  -- Check if either approval_status or operational_status changed
  IF (OLD.approval_status IS DISTINCT FROM NEW.approval_status) 
     OR (OLD.operational_status IS DISTINCT FROM NEW.operational_status) THEN
    
    -- Check if new columns exist in status_history table
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'merchant_store_status_history' 
      AND column_name = 'from_approval_status'
    ) INTO v_has_new_columns;
    
    -- Insert status history
    -- Now operational_status is enum type, so no casting needed
    IF v_has_new_columns THEN
      INSERT INTO merchant_store_status_history (
        store_id,
        from_status,
        to_status,
        from_approval_status,
        to_approval_status,
        from_operational_status,
        to_operational_status,
        changed_by,
        changed_by_id,
        created_at
      ) VALUES (
        NEW.id,
        OLD.status,  -- store_status enum (ACTIVE/INACTIVE)
        NEW.status,  -- store_status enum (ACTIVE/INACTIVE)
        OLD.approval_status,  -- store_approval_status enum
        NEW.approval_status,  -- store_approval_status enum
        OLD.operational_status,  -- store_operational_status enum (OPEN/CLOSED)
        NEW.operational_status,  -- store_operational_status enum (OPEN/CLOSED)
        'SYSTEM',
        NULL,
        NOW()
      );
    ELSE
      -- Fallback to old format if new columns don't exist
      INSERT INTO merchant_store_status_history (
        store_id,
        from_status,
        to_status,
        changed_by,
        changed_by_id,
        created_at
      ) VALUES (
        NEW.id,
        OLD.status,  -- store_status enum (ACTIVE/INACTIVE)
        NEW.status,  -- store_status enum (ACTIVE/INACTIVE)
        'SYSTEM',
        NULL,
        NOW()
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TYPE store_operational_status IS 'Store operational status enum with only OPEN and CLOSED values. Fully manual control - no automatic updates.';
COMMENT ON COLUMN merchant_stores.operational_status IS 'Store operational status (OPEN/CLOSED). Fully manual control - no automatic updates. Store owner controls via UI. Now uses enum type for dropdown support.';
