-- Migration: Store Settings Activity Tracking Enhancement
-- Purpose: Ensure activity tracking tables support store settings changes
-- Date: 2026-02-17

-- ============================================
-- ADD NEW ACTIVITY TYPE FOR SETTINGS CHANGES
-- ============================================

-- Add SETTINGS_CHANGE to activity_type enum if it doesn't exist
DO $$ 
BEGIN
  -- Check if SETTINGS_CHANGE already exists in the enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'SETTINGS_CHANGE' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'activity_type')
  ) THEN
    ALTER TYPE activity_type ADD VALUE 'SETTINGS_CHANGE';
  END IF;
END $$;

-- ============================================
-- VERIFY/CREATE ACTIVITY TRACKING TABLES
-- ============================================

-- Ensure merchant_store_activity_log table exists with proper columns
DO $$ 
BEGIN
  -- Add activity_type column if it doesn't exist (it should already exist, but check)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'merchant_store_activity_log' 
    AND column_name = 'activity_type'
  ) THEN
    ALTER TABLE public.merchant_store_activity_log
      ADD COLUMN activity_type TEXT;
  END IF;

  -- Ensure activity_description exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'merchant_store_activity_log' 
    AND column_name = 'activity_description'
  ) THEN
    ALTER TABLE public.merchant_store_activity_log
      ADD COLUMN activity_description TEXT;
  END IF;

  -- Ensure activity_metadata exists (should be JSONB)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'merchant_store_activity_log' 
    AND column_name = 'activity_metadata'
  ) THEN
    ALTER TABLE public.merchant_store_activity_log
      ADD COLUMN activity_metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- ============================================
-- CREATE INDEXES FOR ACTIVITY QUERIES
-- ============================================

-- Index for querying activities by store and type
CREATE INDEX IF NOT EXISTS merchant_store_activity_log_store_type_idx 
  ON public.merchant_store_activity_log(store_id, activity_type) 
  WHERE activity_type IS NOT NULL;

-- Index for recent activities query
CREATE INDEX IF NOT EXISTS merchant_store_activity_log_created_at_desc_idx 
  ON public.merchant_store_activity_log(created_at DESC);

-- Index for querying by user who performed action
CREATE INDEX IF NOT EXISTS merchant_store_activity_log_actioned_by_idx 
  ON public.merchant_store_activity_log(actioned_by_id, actioned_by_email) 
  WHERE actioned_by_id IS NOT NULL;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON COLUMN public.merchant_store_activity_log.activity_type IS 'Type of activity (e.g., DAY_TOGGLE, TIMING_UPDATE, TOGGLE_SAME_FOR_ALL, etc.)';
COMMENT ON COLUMN public.merchant_store_activity_log.activity_description IS 'Human-readable description of the activity';
COMMENT ON COLUMN public.merchant_store_activity_log.activity_metadata IS 'Additional metadata about the activity (JSONB)';

-- ============================================
-- VERIFY MERCHANT_AUDIT_LOGS TABLE
-- ============================================

-- Ensure merchant_audit_logs has proper structure for store settings
DO $$ 
BEGIN
  -- Verify action_field column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'merchant_audit_logs' 
    AND column_name = 'action_field'
  ) THEN
    ALTER TABLE public.merchant_audit_logs
      ADD COLUMN action_field TEXT;
  END IF;

  -- Verify audit_metadata exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'merchant_audit_logs' 
    AND column_name = 'audit_metadata'
  ) THEN
    ALTER TABLE public.merchant_audit_logs
      ADD COLUMN audit_metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Index for audit logs by entity and action
CREATE INDEX IF NOT EXISTS merchant_audit_logs_entity_action_idx 
  ON public.merchant_audit_logs(entity_type, entity_id, action) 
  WHERE entity_type = 'STORE';

-- Index for recent audit logs
CREATE INDEX IF NOT EXISTS merchant_audit_logs_created_at_desc_idx 
  ON public.merchant_audit_logs(created_at DESC);
