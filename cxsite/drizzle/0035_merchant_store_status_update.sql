-- ============================================================================
-- MERCHANT STORES STATUS UPDATE
-- Migration: 0035_merchant_store_status_update
-- Database: Supabase PostgreSQL
-- 
-- This migration updates merchant_stores table with correct enums and business logic:
-- 1. store_status: ACTIVE/INACTIVE (default: INACTIVE)
-- 2. store_type: Updated enum values
-- 3. store_operational_status: OPEN/CLOSED (manual control only)
-- 4. store_approval_status: Remove PENDING, keep other values
-- 5. Enforce: store_status = ACTIVE ONLY when approval_status = APPROVED
-- ============================================================================

-- ============================================================================
-- STEP 1: UPDATE/CREATE ENUMS
-- ============================================================================

-- Ensure store_status enum has ACTIVE and INACTIVE values
-- Note: We can't remove old enum values, but we'll only use ACTIVE/INACTIVE
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_status') THEN
    -- Ensure ACTIVE and INACTIVE exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ACTIVE' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'store_status')) THEN
      ALTER TYPE store_status ADD VALUE 'ACTIVE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'INACTIVE' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'store_status')) THEN
      ALTER TYPE store_status ADD VALUE 'INACTIVE';
    END IF;
  ELSE
    -- Create new enum if it doesn't exist
    CREATE TYPE store_status AS ENUM ('ACTIVE', 'INACTIVE');
  END IF;
END $$;

-- Update store_type enum with new values
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_type') THEN
    -- Add missing enum values if they don't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CAFE' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'store_type')) THEN
      ALTER TYPE store_type ADD VALUE IF NOT EXISTS 'CAFE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'BAKERY' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'store_type')) THEN
      ALTER TYPE store_type ADD VALUE IF NOT EXISTS 'BAKERY';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'OTHERS' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'store_type')) THEN
      ALTER TYPE store_type ADD VALUE IF NOT EXISTS 'OTHERS';
    END IF;
  ELSE
    -- Create new enum if it doesn't exist
    CREATE TYPE store_type AS ENUM (
      'RESTAURANT',
      'CAFE',
      'BAKERY',
      'CLOUD_KITCHEN',
      'GROCERY',
      'PHARMA',
      'STATIONERY',
      'OTHERS'
    );
  END IF;
END $$;

-- Update store_operational_status enum from (ACTIVE, INACTIVE) to (OPEN, CLOSED)
-- Add new values first, then migrate data, old values can remain but won't be used
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_operational_status') THEN
    -- Add new enum values if they don't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'OPEN' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'store_operational_status')) THEN
      ALTER TYPE store_operational_status ADD VALUE 'OPEN';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CLOSED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'store_operational_status')) THEN
      ALTER TYPE store_operational_status ADD VALUE 'CLOSED';
    END IF;
  ELSE
    -- Create new enum if it doesn't exist
    CREATE TYPE store_operational_status AS ENUM ('OPEN', 'CLOSED');
  END IF;
END $$;

-- Update store_approval_status enum to remove PENDING
-- Note: We can't remove enum values, but we can ensure PENDING is not used
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_approval_status') THEN
    CREATE TYPE store_approval_status AS ENUM (
      'DRAFT',
      'SUBMITTED',
      'UNDER_VERIFICATION',
      'APPROVED',
      'REJECTED',
      'BLOCKED',
      'DELISTED',
      'SUSPENDED'
    );
  END IF;
END $$;

-- ============================================================================
-- STEP 2: MIGRATE EXISTING DATA (PART 1 - Before enum changes)
-- ============================================================================

-- Migrate store_status: Map all old values to ACTIVE/INACTIVE based on approval_status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'merchant_stores' 
    AND column_name = 'status'
  ) THEN
    -- Update status based on approval_status (enforce business rule)
    UPDATE merchant_stores
    SET status = CASE
      WHEN approval_status::text = 'APPROVED' THEN 'ACTIVE'::store_status
      ELSE 'INACTIVE'::store_status
    END
    WHERE status::text NOT IN ('ACTIVE', 'INACTIVE') 
       OR (approval_status::text = 'APPROVED' AND status::text != 'ACTIVE')
       OR (approval_status::text != 'APPROVED' AND status::text != 'INACTIVE');
  END IF;
END $$;

-- ============================================================================
-- STEP 2B: MIGRATE store_operational_status DATA
-- Workaround: Use temporary text column to migrate, then convert back
-- IMPORTANT: New enum values must be committed before use, so we do this in steps
-- ============================================================================

-- Step 1: Drop dependent triggers first (outside DO block so it commits)
DROP TRIGGER IF EXISTS merchant_stores_status_history_trigger ON merchant_stores;
DROP TRIGGER IF EXISTS merchant_stores_sync_operational_status_trigger ON merchant_stores;

-- Step 2: Migrate store_operational_status data
-- Since new enum values can't be used in same transaction, we use a workaround
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'merchant_stores' 
    AND column_name = 'operational_status'
  ) THEN
    -- Add temporary text column
    ALTER TABLE merchant_stores 
      ADD COLUMN IF NOT EXISTS operational_status_temp TEXT;
    
    -- Migrate data to text column
    UPDATE merchant_stores
    SET operational_status_temp = CASE
      WHEN operational_status::text = 'ACTIVE' THEN 'OPEN'
      WHEN operational_status::text = 'INACTIVE' THEN 'CLOSED'
      WHEN operational_status::text = 'OPEN' THEN 'OPEN'
      WHEN operational_status::text = 'CLOSED' THEN 'CLOSED'
      ELSE 'CLOSED'
    END;
    
    -- Drop the old enum column (now safe since triggers are dropped)
    ALTER TABLE merchant_stores 
      DROP COLUMN IF EXISTS operational_status;
  END IF;
END $$;

-- Step 3: Create new column as TEXT first (completely avoid enum until final step)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'merchant_stores' 
    AND column_name = 'operational_status'
  ) THEN
    -- Create column as TEXT (no enum values used)
    ALTER TABLE merchant_stores 
      ADD COLUMN operational_status_new TEXT;
  END IF;
END $$;

-- Step 4: Migrate data from temp column to new text column
UPDATE merchant_stores
SET operational_status_new = COALESCE(operational_status_temp, 'CLOSED')
WHERE operational_status_new IS NULL;

-- Step 5: For now, keep the column as TEXT to avoid enum value issues
-- We'll convert it to enum in a follow-up statement after enum values are committed
-- Just rename the text column to the final name for now
DO $$
BEGIN
  -- Check if we need to rename
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'merchant_stores' 
    AND column_name = 'operational_status_new'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'merchant_stores' 
    AND column_name = 'operational_status'
  ) THEN
    -- Rename text column to final name (we'll convert type later)
    ALTER TABLE merchant_stores 
      RENAME COLUMN operational_status_new TO operational_status;
  END IF;
END $$;

-- Step 6: NOTE - Due to PostgreSQL limitation, we cannot convert TEXT to enum
-- in the same transaction where enum values are added.
-- The column will remain as TEXT for now. After this migration completes,
-- run this command manually to convert it:
-- 
-- ALTER TABLE merchant_stores 
--   ALTER COLUMN operational_status 
--   TYPE store_operational_status 
--   USING operational_status::store_operational_status;
--
-- For now, add CHECK constraint and set default as TEXT
-- Drop constraint if it exists first, then add it
ALTER TABLE merchant_stores
  DROP CONSTRAINT IF EXISTS operational_status_check;
  
ALTER TABLE merchant_stores
  ADD CONSTRAINT operational_status_check 
  CHECK (operational_status IN ('OPEN', 'CLOSED'));

-- Set NOT NULL
ALTER TABLE merchant_stores
  ALTER COLUMN operational_status SET NOT NULL;

-- Set default as TEXT value
ALTER TABLE merchant_stores
  ALTER COLUMN operational_status SET DEFAULT 'CLOSED';

-- Step 7: Drop temporary column
ALTER TABLE merchant_stores 
  DROP COLUMN IF EXISTS operational_status_temp;

-- Migrate store_approval_status: Remove PENDING, convert to DRAFT
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'merchant_stores' 
    AND column_name = 'approval_status'
  ) THEN
    -- Convert PENDING to DRAFT
    UPDATE merchant_stores
    SET approval_status = 'DRAFT'::store_approval_status
    WHERE approval_status::text = 'PENDING';
  END IF;
END $$;

-- ============================================================================
-- STEP 3: UPDATE TABLE COLUMNS
-- ============================================================================

-- Ensure status column uses store_status enum and defaults to INACTIVE
DO $$
BEGIN
  -- Check if status column exists and update it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'merchant_stores' 
    AND column_name = 'status'
  ) THEN
    -- Update default
    ALTER TABLE merchant_stores
      ALTER COLUMN status SET DEFAULT 'INACTIVE'::store_status;
    
    -- Ensure NOT NULL
    ALTER TABLE merchant_stores
      ALTER COLUMN status SET NOT NULL;
  ELSE
    -- Add status column if it doesn't exist
    ALTER TABLE merchant_stores
      ADD COLUMN status store_status NOT NULL DEFAULT 'INACTIVE'::store_status;
  END IF;
END $$;

-- NOTE: operational_status is handled in Step 2B above
-- It remains as TEXT type to avoid enum value issues
-- Do NOT try to set it as enum type here - that will cause errors

-- Ensure approval_status doesn't have PENDING as default
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'merchant_stores' 
    AND column_name = 'approval_status'
  ) THEN
    -- Change default from PENDING to DRAFT
    ALTER TABLE merchant_stores
      ALTER COLUMN approval_status SET DEFAULT 'DRAFT'::store_approval_status;
  END IF;
END $$;

-- ============================================================================
-- STEP 4: CREATE/UPDATE TRIGGER FUNCTIONS
-- ============================================================================

-- Function: Enforce store_status rule (ACTIVE only when APPROVED)
-- This function prevents direct manipulation of status - it's always derived from approval_status
CREATE OR REPLACE FUNCTION enforce_store_status_rule()
RETURNS TRIGGER AS $$
BEGIN
  -- Enforce: store_status = ACTIVE ONLY when approval_status = APPROVED
  -- For all other approval statuses, store_status must be INACTIVE
  -- IMPORTANT: Status cannot be set directly - it's always derived from approval_status
  
  -- If approval_status changed, update status accordingly
  IF (OLD.approval_status IS DISTINCT FROM NEW.approval_status) OR TG_OP = 'INSERT' THEN
    IF NEW.approval_status = 'APPROVED'::store_approval_status THEN
      -- When approved, set status to ACTIVE
      NEW.status := 'ACTIVE'::store_status;
    ELSE
      -- For all other approval statuses, set status to INACTIVE
      NEW.status := 'INACTIVE'::store_status;
    END IF;
  ELSIF (OLD.status IS DISTINCT FROM NEW.status) AND (OLD.approval_status IS NOT DISTINCT FROM NEW.approval_status) THEN
    -- If someone tries to change status directly without changing approval_status, revert it
    -- Status must always match approval_status
    IF NEW.approval_status = 'APPROVED'::store_approval_status THEN
      NEW.status := 'ACTIVE'::store_status;
    ELSE
      NEW.status := 'INACTIVE'::store_status;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Remove old sync function for operational_status (it should be manual)
-- We'll drop the old trigger, but keep the function for backward compatibility
DROP TRIGGER IF EXISTS merchant_stores_sync_operational_status_trigger ON merchant_stores;

-- Ensure create_merchant_store_status_history function exists
-- This function should already exist from previous migrations, but we ensure it's available
CREATE OR REPLACE FUNCTION create_merchant_store_status_history()
RETURNS TRIGGER AS $$
DECLARE
  v_has_new_columns BOOLEAN;
  v_old_operational_status store_operational_status;
  v_new_operational_status store_operational_status;
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
    
    -- Cast operational_status to enum type (handles both TEXT and enum types)
    -- operational_status might be TEXT or enum, so we cast it safely
    BEGIN
      v_old_operational_status := OLD.operational_status::text::store_operational_status;
    EXCEPTION WHEN OTHERS THEN
      -- If cast fails, try to map common values
      v_old_operational_status := CASE 
        WHEN OLD.operational_status::text IN ('ACTIVE', 'OPEN') THEN 'OPEN'::store_operational_status
        WHEN OLD.operational_status::text IN ('INACTIVE', 'CLOSED') THEN 'CLOSED'::store_operational_status
        ELSE 'CLOSED'::store_operational_status
      END;
    END;
    
    BEGIN
      v_new_operational_status := NEW.operational_status::text::store_operational_status;
    EXCEPTION WHEN OTHERS THEN
      -- If cast fails, try to map common values
      v_new_operational_status := CASE 
        WHEN NEW.operational_status::text IN ('ACTIVE', 'OPEN') THEN 'OPEN'::store_operational_status
        WHEN NEW.operational_status::text IN ('INACTIVE', 'CLOSED') THEN 'CLOSED'::store_operational_status
        ELSE 'CLOSED'::store_operational_status
      END;
    END;
    
    -- Insert status history
    -- IMPORTANT: from_status and to_status are store_status enum type, so use OLD.status and NEW.status
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
        v_old_operational_status,  -- store_operational_status enum (properly cast)
        v_new_operational_status,  -- store_operational_status enum (properly cast)
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

-- Update check_store_submission_complete to use DRAFT instead of PENDING
CREATE OR REPLACE FUNCTION check_store_submission_complete()
RETURNS TRIGGER AS $$
BEGIN
  -- If onboarding is not completed and approval_status is not DRAFT, set to DRAFT
  IF NEW.onboarding_completed = FALSE 
     AND NEW.approval_status != 'DRAFT'::store_approval_status THEN
    NEW.approval_status := 'DRAFT'::store_approval_status;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: CREATE/UPDATE TRIGGERS
-- ============================================================================

-- Trigger: Enforce store_status rule on approval_status change
DROP TRIGGER IF EXISTS merchant_stores_enforce_status_rule ON merchant_stores;
CREATE TRIGGER merchant_stores_enforce_status_rule
  BEFORE INSERT OR UPDATE OF approval_status, status ON merchant_stores
  FOR EACH ROW
  EXECUTE FUNCTION enforce_store_status_rule();

-- Trigger: Auto-set DRAFT for incomplete submissions
DROP TRIGGER IF EXISTS merchant_stores_check_submission_trigger ON merchant_stores;
CREATE TRIGGER merchant_stores_check_submission_trigger
  BEFORE INSERT OR UPDATE OF onboarding_completed, approval_status ON merchant_stores
  FOR EACH ROW
  EXECUTE FUNCTION check_store_submission_complete();

-- Note: We intentionally do NOT create a trigger for operational_status
-- It must be manually controlled by the store owner via UI

-- Recreate status_history trigger (it was dropped during column migration)
-- This trigger tracks changes to approval_status and operational_status
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
-- STEP 6: UPDATE INDEXES
-- ============================================================================

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS merchant_stores_status_idx ON merchant_stores(status);
CREATE INDEX IF NOT EXISTS merchant_stores_approval_status_idx ON merchant_stores(approval_status);
CREATE INDEX IF NOT EXISTS merchant_stores_operational_status_idx ON merchant_stores(operational_status);
CREATE INDEX IF NOT EXISTS merchant_stores_store_type_idx ON merchant_stores(store_type) WHERE store_type IS NOT NULL;

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS merchant_stores_status_approval_idx 
  ON merchant_stores(status, approval_status) 
  WHERE status = 'ACTIVE'::store_status AND approval_status = 'APPROVED'::store_approval_status;

-- ============================================================================
-- STEP 7: COMMENTS
-- ============================================================================

COMMENT ON COLUMN merchant_stores.status IS 'Store status (ACTIVE/INACTIVE). Default: INACTIVE. Automatically set to ACTIVE only when approval_status = APPROVED. Enforced by database trigger.';
COMMENT ON COLUMN merchant_stores.approval_status IS 'Store approval status. Default: DRAFT. Auto-changes to DRAFT if onboarding_completed = FALSE.';
COMMENT ON COLUMN merchant_stores.operational_status IS 'Store operational status (OPEN/CLOSED). Fully manual control - no automatic updates. Store owner controls via UI.';
COMMENT ON COLUMN merchant_stores.store_type IS 'Store type: RESTAURANT, CAFE, BAKERY, CLOUD_KITCHEN, GROCERY, PHARMA, STATIONERY, OTHERS';
COMMENT ON FUNCTION enforce_store_status_rule() IS 'Enforces business rule: store_status = ACTIVE ONLY when approval_status = APPROVED. For all other approval statuses, store_status = INACTIVE.';
