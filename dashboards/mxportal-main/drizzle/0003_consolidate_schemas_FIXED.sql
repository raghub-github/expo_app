-- ============================================================================
-- SCHEMA CONSOLIDATION & CONFLICT RESOLUTION
-- Migration: 0003_consolidate_schemas (FIXED)
-- Database: Supabase PostgreSQL
-- 
-- This migration consolidates schemas from 0000 and 0001 into 0002
-- Resolves enum and table conflicts
-- ============================================================================

-- ============================================================================
-- DROP OLD ENUMS (from 0001)
-- ============================================================================

DROP TYPE IF EXISTS onboarding_status CASCADE;

-- ============================================================================
-- DROP OLD TABLES (from 0000 if they conflict)
-- ============================================================================

-- These tables from 0000 conflict with 0002
-- Drop them if they exist (data migration should happen first if needed)

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS device_sessions CASCADE;
DROP TABLE IF EXISTS rider_location_events CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Note: riders table from 0000 has different structure (TEXT id vs INTEGER id)
-- This should have been migrated to new structure in 0002

-- ============================================================================
-- ENSURE KEY TABLES EXIST (Safety Check)
-- ============================================================================

-- Verify riders table exists with correct structure
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'riders') THEN
    RAISE EXCEPTION 'riders table does not exist. Run 0002_enterprise_rider_schema.sql first.';
  END IF;
END $$;

-- Verify orders table exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
    RAISE EXCEPTION 'orders table does not exist. Run 0002_enterprise_rider_schema.sql first.';
  END IF;
END $$;

-- ============================================================================
-- FIX FOREIGN KEY TYPE MISMATCHES
-- ============================================================================

-- Fix order_actions.order_id to use BIGINT instead of INTEGER
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'order_actions' AND column_name = 'order_id' AND data_type = 'integer'
  ) THEN
    -- Drop constraint first
    ALTER TABLE order_actions DROP CONSTRAINT IF EXISTS order_actions_order_id_fkey;
    
    -- Change column type
    ALTER TABLE order_actions ALTER COLUMN order_id TYPE BIGINT;
    
    -- Re-add constraint
    ALTER TABLE order_actions 
      ADD CONSTRAINT order_actions_order_id_fkey 
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Fix order_events.order_id to use BIGINT instead of INTEGER
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'order_events' AND column_name = 'order_id' AND data_type = 'integer'
  ) THEN
    ALTER TABLE order_events DROP CONSTRAINT IF EXISTS order_events_order_id_fkey;
    ALTER TABLE order_events ALTER COLUMN order_id TYPE BIGINT;
    ALTER TABLE order_events 
      ADD CONSTRAINT order_events_order_id_fkey 
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Fix ratings.order_id to use BIGINT instead of INTEGER
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ratings' AND column_name = 'order_id' AND data_type = 'integer'
  ) THEN
    ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_order_id_fkey;
    ALTER TABLE ratings ALTER COLUMN order_id TYPE BIGINT;
    ALTER TABLE ratings 
      ADD CONSTRAINT ratings_order_id_fkey 
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Fix tickets.order_id to use BIGINT instead of INTEGER
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tickets' AND column_name = 'order_id' AND data_type = 'integer'
  ) THEN
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_order_id_fkey;
    ALTER TABLE tickets ALTER COLUMN order_id TYPE BIGINT;
    ALTER TABLE tickets 
      ADD CONSTRAINT tickets_order_id_fkey 
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Fix fraud_logs.order_id to use BIGINT instead of INTEGER
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fraud_logs' AND column_name = 'order_id' AND data_type = 'integer'
  ) THEN
    ALTER TABLE fraud_logs DROP CONSTRAINT IF EXISTS fraud_logs_order_id_fkey;
    ALTER TABLE fraud_logs ALTER COLUMN order_id TYPE BIGINT;
    ALTER TABLE fraud_logs 
      ADD CONSTRAINT fraud_logs_order_id_fkey 
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify rider table structure
DO $$
DECLARE
  v_rider_id_type TEXT;
BEGIN
  SELECT data_type INTO v_rider_id_type 
  FROM information_schema.columns 
  WHERE table_name = 'riders' AND column_name = 'id';
  
  IF v_rider_id_type != 'integer' THEN
    RAISE WARNING 'riders.id should be INTEGER, found: %', v_rider_id_type;
  END IF;
END $$;

-- Verify orders table structure
DO $$
DECLARE
  v_order_id_type TEXT;
BEGIN
  SELECT data_type INTO v_order_id_type 
  FROM information_schema.columns 
  WHERE table_name = 'orders' AND column_name = 'id';
  
  IF v_order_id_type != 'bigint' THEN
    RAISE WARNING 'orders.id should be BIGINT, found: %', v_order_id_type;
  END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON SCHEMA public IS 'GatiMitra Platform - Consolidated Schema. Run after 0002_enterprise_rider_schema.sql';
