-- ============================================================================
-- MERCHANT DOMAIN STATUS SIMPLIFICATION
-- Migration: 0034_merchant_status_simplification
-- Database: Supabase PostgreSQL
-- 
-- This migration simplifies merchant status management by:
-- 1. Separating parent approval status (4 fixed values) from operational status
-- 2. Separating store approval status (9 values) from operational status (2 values)
-- 3. Adding automatic cascading suspension when parent is suspended/blocked
-- 4. Maintaining backward compatibility with existing is_active fields
-- ============================================================================

-- ============================================================================
-- STEP 1: CREATE NEW ENUMS
-- ============================================================================

-- Parent Approval Status Enum (4 fixed values)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'parent_approval_status') THEN
    CREATE TYPE parent_approval_status AS ENUM ('APPROVED', 'REJECTED', 'BLOCKED', 'SUSPENDED');
  END IF;
END $$;

-- Store Approval Status Enum (9 values)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_approval_status') THEN
    CREATE TYPE store_approval_status AS ENUM (
      'DRAFT', 
      'SUBMITTED', 
      'PENDING', 
      'UNDER_VERIFICATION', 
      'APPROVED', 
      'REJECTED', 
      'BLOCKED', 
      'DELISTED', 
      'SUSPENDED'
    );
  END IF;
END $$;

-- Store Operational Status Enum (2 values)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_operational_status') THEN
    CREATE TYPE store_operational_status AS ENUM ('ACTIVE', 'INACTIVE');
  END IF;
END $$;

-- ============================================================================
-- STEP 2: UPDATE MERCHANT_PARENTS TABLE
-- ============================================================================

-- Add new approval_status column
ALTER TABLE merchant_parents
  ADD COLUMN IF NOT EXISTS approval_status parent_approval_status;

-- Migrate existing data from status to approval_status (only if status column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'merchant_parents' 
    AND column_name = 'status'
  ) THEN
    UPDATE merchant_parents
    SET approval_status = CASE
      WHEN status::text = 'PENDING_APPROVAL' THEN 'APPROVED'::parent_approval_status
      WHEN status::text = 'APPROVED' THEN 'APPROVED'::parent_approval_status
      WHEN status::text = 'SUSPENDED' THEN 'SUSPENDED'::parent_approval_status
      WHEN status::text = 'BLOCKED' THEN 'BLOCKED'::parent_approval_status
      WHEN status::text = 'ACTIVE' THEN 'APPROVED'::parent_approval_status
      WHEN status::text = 'INACTIVE' THEN 'APPROVED'::parent_approval_status
      ELSE 'APPROVED'::parent_approval_status
    END
    WHERE approval_status IS NULL;
  ELSE
    -- If status column doesn't exist, set default value for all rows
    UPDATE merchant_parents
    SET approval_status = 'APPROVED'::parent_approval_status
    WHERE approval_status IS NULL;
  END IF;
END $$;

-- Set default and make NOT NULL
ALTER TABLE merchant_parents
  ALTER COLUMN approval_status SET DEFAULT 'APPROVED'::parent_approval_status,
  ALTER COLUMN approval_status SET NOT NULL;

-- Add index on approval_status
CREATE INDEX IF NOT EXISTS merchant_parents_approval_status_idx 
  ON merchant_parents(approval_status);

-- ============================================================================
-- STEP 3: UPDATE MERCHANT_STORES TABLE
-- ============================================================================

-- Add new approval_status column
ALTER TABLE merchant_stores
  ADD COLUMN IF NOT EXISTS approval_status store_approval_status;

-- Add new operational_status column
ALTER TABLE merchant_stores
  ADD COLUMN IF NOT EXISTS operational_status store_operational_status;

-- Migrate existing data from status to approval_status (only if status column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'merchant_stores' 
    AND column_name = 'status'
  ) THEN
    UPDATE merchant_stores
    SET approval_status = CASE
      WHEN status::text = 'DRAFT' THEN 'DRAFT'::store_approval_status
      WHEN status::text = 'SUBMITTED' THEN 'SUBMITTED'::store_approval_status
      WHEN status::text = 'UNDER_VERIFICATION' THEN 'UNDER_VERIFICATION'::store_approval_status
      WHEN status::text = 'APPROVED' THEN 'APPROVED'::store_approval_status
      WHEN status::text = 'REJECTED' THEN 'REJECTED'::store_approval_status
      WHEN status::text = 'BLOCKED' THEN 'BLOCKED'::store_approval_status
      WHEN status::text = 'DELISTED' THEN 'DELISTED'::store_approval_status
      WHEN status::text = 'SUSPENDED' THEN 'SUSPENDED'::store_approval_status
      WHEN status::text = 'ACTIVE' THEN 'APPROVED'::store_approval_status
      WHEN status::text = 'INACTIVE' THEN 'APPROVED'::store_approval_status
      ELSE 'DRAFT'::store_approval_status
    END
    WHERE approval_status IS NULL;
    
    -- Migrate existing data to operational_status based on old status and is_active
    UPDATE merchant_stores
    SET operational_status = CASE
      WHEN (status::text IN ('ACTIVE', 'APPROVED') AND is_active = TRUE) 
        THEN 'ACTIVE'::store_operational_status
      ELSE 'INACTIVE'::store_operational_status
    END
    WHERE operational_status IS NULL;
  ELSE
    -- If status column doesn't exist, set default values for all rows
    UPDATE merchant_stores
    SET 
      approval_status = CASE 
        WHEN onboarding_completed = FALSE THEN 'DRAFT'::store_approval_status
        ELSE 'PENDING'::store_approval_status
      END,
      operational_status = CASE
        WHEN is_active = TRUE THEN 'ACTIVE'::store_operational_status
        ELSE 'INACTIVE'::store_operational_status
      END
    WHERE approval_status IS NULL OR operational_status IS NULL;
  END IF;
END $$;

-- Set defaults and make NOT NULL
ALTER TABLE merchant_stores
  ALTER COLUMN approval_status SET DEFAULT 'PENDING'::store_approval_status,
  ALTER COLUMN approval_status SET NOT NULL,
  ALTER COLUMN operational_status SET DEFAULT 'INACTIVE'::store_operational_status,
  ALTER COLUMN operational_status SET NOT NULL;

-- Add indexes on new status columns
CREATE INDEX IF NOT EXISTS merchant_stores_approval_status_idx 
  ON merchant_stores(approval_status);
CREATE INDEX IF NOT EXISTS merchant_stores_operational_status_idx 
  ON merchant_stores(operational_status);

-- ============================================================================
-- STEP 4: UPDATE MERCHANT_STORE_STATUS_HISTORY TABLE
-- ============================================================================

-- Add new columns for tracking approval and operational status separately
ALTER TABLE merchant_store_status_history
  ADD COLUMN IF NOT EXISTS from_approval_status store_approval_status,
  ADD COLUMN IF NOT EXISTS to_approval_status store_approval_status,
  ADD COLUMN IF NOT EXISTS from_operational_status store_operational_status,
  ADD COLUMN IF NOT EXISTS to_operational_status store_operational_status;

-- Add indexes on new status columns
CREATE INDEX IF NOT EXISTS merchant_store_status_history_to_approval_status_idx 
  ON merchant_store_status_history(to_approval_status);
CREATE INDEX IF NOT EXISTS merchant_store_status_history_to_operational_status_idx 
  ON merchant_store_status_history(to_operational_status);

-- ============================================================================
-- STEP 5: CREATE TRIGGER FUNCTIONS
-- ============================================================================

-- Function 5.1: Sync is_active with operational_status (bidirectional)
CREATE OR REPLACE FUNCTION sync_store_operational_status()
RETURNS TRIGGER AS $$
BEGIN
  -- When operational_status changes, update is_active
  IF TG_OP = 'UPDATE' AND OLD.operational_status IS DISTINCT FROM NEW.operational_status THEN
    NEW.is_active := (NEW.operational_status = 'ACTIVE'::store_operational_status);
  END IF;
  
  -- When is_active changes, update operational_status
  IF TG_OP = 'UPDATE' AND OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    NEW.operational_status := CASE 
      WHEN NEW.is_active THEN 'ACTIVE'::store_operational_status
      ELSE 'INACTIVE'::store_operational_status
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Sync operational_status and is_active on merchant_stores
DROP TRIGGER IF EXISTS merchant_stores_sync_operational_status_trigger ON merchant_stores;
CREATE TRIGGER merchant_stores_sync_operational_status_trigger
  BEFORE UPDATE OF operational_status, is_active ON merchant_stores
  FOR EACH ROW
  EXECUTE FUNCTION sync_store_operational_status();

-- Function 5.2: Auto-suspend child stores when parent is suspended/blocked
CREATE OR REPLACE FUNCTION cascade_parent_status_to_stores()
RETURNS TRIGGER AS $$
DECLARE
  v_store_record RECORD;
BEGIN
  -- Only process if approval_status changed to SUSPENDED or BLOCKED
  IF NEW.approval_status IN ('SUSPENDED'::parent_approval_status, 'BLOCKED'::parent_approval_status) 
     AND (OLD.approval_status IS NULL OR OLD.approval_status IS DISTINCT FROM NEW.approval_status) THEN
    
    -- Update all child stores
    FOR v_store_record IN 
      SELECT id, approval_status, operational_status 
      FROM merchant_stores 
      WHERE parent_id = NEW.id 
        AND deleted_at IS NULL
    LOOP
      -- Only update if store is not already suspended
      IF v_store_record.approval_status != 'SUSPENDED'::store_approval_status THEN
        UPDATE merchant_stores
        SET 
          approval_status = 'SUSPENDED'::store_approval_status,
          operational_status = 'INACTIVE'::store_operational_status,
          is_active = FALSE,
          updated_at = NOW()
        WHERE id = v_store_record.id;
        
        -- Create status history entry for the store
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
          change_reason,
          created_at
        ) VALUES (
          v_store_record.id,
          v_store_record.approval_status::text || '_' || v_store_record.operational_status::text,
          'SUSPENDED_INACTIVE',
          v_store_record.approval_status,
          'SUSPENDED'::store_approval_status,
          v_store_record.operational_status,
          'INACTIVE'::store_operational_status,
          'SYSTEM',
          NULL,
          'Parent merchant ' || NEW.approval_status::text || ' - cascading to all stores',
          NOW()
        );
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Cascade parent status to stores
DROP TRIGGER IF EXISTS merchant_parents_cascade_status_trigger ON merchant_parents;
CREATE TRIGGER merchant_parents_cascade_status_trigger
  AFTER UPDATE OF approval_status ON merchant_parents
  FOR EACH ROW
  WHEN (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
  EXECUTE FUNCTION cascade_parent_status_to_stores();

-- Function 5.3: Auto-set DRAFT if submission incomplete
CREATE OR REPLACE FUNCTION check_store_submission_complete()
RETURNS TRIGGER AS $$
BEGIN
  -- If onboarding is not completed and approval_status is not DRAFT, set to DRAFT
  -- This ensures incomplete submissions always have DRAFT status
  IF NEW.onboarding_completed = FALSE 
     AND NEW.approval_status != 'DRAFT'::store_approval_status THEN
    NEW.approval_status := 'DRAFT'::store_approval_status;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-set DRAFT for incomplete submissions
DROP TRIGGER IF EXISTS merchant_stores_check_submission_trigger ON merchant_stores;
CREATE TRIGGER merchant_stores_check_submission_trigger
  BEFORE INSERT OR UPDATE OF onboarding_completed, approval_status ON merchant_stores
  FOR EACH ROW
  EXECUTE FUNCTION check_store_submission_complete();

-- ============================================================================
-- STEP 6: UPDATE STATUS HISTORY TRIGGER
-- ============================================================================

-- Update the status history function to track both approval and operational status
CREATE OR REPLACE FUNCTION create_merchant_store_status_history()
RETURNS TRIGGER AS $$
DECLARE
  v_old_combined TEXT;
  v_new_combined TEXT;
BEGIN
  -- Check if either approval_status or operational_status changed
  IF (OLD.approval_status IS DISTINCT FROM NEW.approval_status) 
     OR (OLD.operational_status IS DISTINCT FROM NEW.operational_status) THEN
    
    -- Build combined status strings for backward compatibility
    v_old_combined := COALESCE(OLD.approval_status::text, '') || '_' || COALESCE(OLD.operational_status::text, '');
    v_new_combined := COALESCE(NEW.approval_status::text, '') || '_' || COALESCE(NEW.operational_status::text, '');
    
    -- Insert status history with both old and new format
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
      v_old_combined,
      v_new_combined,
      OLD.approval_status,
      NEW.approval_status,
      OLD.operational_status,
      NEW.operational_status,
      'SYSTEM',
      NULL,
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update the trigger to watch both approval_status and operational_status
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
-- STEP 7: UPDATE FUNCTIONS AND VIEWS
-- ============================================================================

-- Ensure columns exist and are properly typed before creating functions/views
DO $$
BEGIN
  -- Verify columns exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'merchant_stores' 
    AND column_name = 'approval_status'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'merchant_stores' 
    AND column_name = 'operational_status'
  ) THEN
    RAISE EXCEPTION 'Required columns approval_status or operational_status do not exist in merchant_stores';
  END IF;
END $$;

-- Drop existing function if it exists (to allow return type change)
DROP FUNCTION IF EXISTS get_parent_active_stores(BIGINT);

-- Update get_parent_active_stores function to use new status columns
CREATE FUNCTION get_parent_active_stores(p_parent_id BIGINT)
RETURNS TABLE (
  store_id BIGINT,
  store_name TEXT,
  city TEXT,
  approval_status store_approval_status,
  operational_status store_operational_status,
  is_active BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ms.id, 
    ms.store_name, 
    ms.city, 
    ms.approval_status,
    ms.operational_status,
    ms.is_active
  FROM merchant_stores ms
  WHERE ms.parent_id = p_parent_id
    AND ms.operational_status = 'ACTIVE'::store_operational_status
    AND ms.is_active = TRUE
    AND ms.deleted_at IS NULL
  ORDER BY ms.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update active_merchant_stores view to use new status columns
-- Using text comparison to avoid enum type issues in views
DROP VIEW IF EXISTS active_merchant_stores;

CREATE VIEW active_merchant_stores AS
SELECT 
  ms.id,
  ms.store_id,
  ms.store_name,
  mp.parent_name,
  ms.city,
  ms.approval_status,
  ms.operational_status,
  ms.is_active,
  ms.is_accepting_orders,
  msa.is_available,
  COUNT(DISTINCT mss.id) AS enabled_services_count,
  STRING_AGG(DISTINCT mss.service_type::text, ',') AS enabled_services
FROM merchant_stores ms
JOIN merchant_parents mp ON ms.parent_id = mp.id
LEFT JOIN merchant_store_availability msa ON ms.id = msa.store_id
LEFT JOIN merchant_store_services mss ON ms.id = mss.store_id AND mss.is_enabled = TRUE
WHERE CAST(ms.operational_status AS TEXT) = 'ACTIVE'
  AND ms.is_active = TRUE
  AND ms.deleted_at IS NULL
  AND CAST(ms.approval_status AS TEXT) = 'APPROVED'
GROUP BY ms.id, ms.store_id, ms.store_name, mp.parent_name, ms.city, 
         ms.approval_status, ms.operational_status, ms.is_active, 
         ms.is_accepting_orders, msa.is_available;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN merchant_parents.approval_status IS 'Parent merchant approval status. Default: APPROVED (auto-approved on registration)';
COMMENT ON COLUMN merchant_stores.approval_status IS 'Store approval status. Default: PENDING, but auto-changes to DRAFT if onboarding_completed = FALSE';
COMMENT ON COLUMN merchant_stores.operational_status IS 'Store operational status (ACTIVE/INACTIVE). Synced with is_active boolean.';
COMMENT ON FUNCTION cascade_parent_status_to_stores() IS 'Automatically suspends and deactivates all child stores when parent is suspended or blocked';
COMMENT ON FUNCTION sync_store_operational_status() IS 'Bidirectionally syncs is_active boolean with operational_status enum';
COMMENT ON FUNCTION check_store_submission_complete() IS 'Automatically sets approval_status to DRAFT if onboarding is not completed';
