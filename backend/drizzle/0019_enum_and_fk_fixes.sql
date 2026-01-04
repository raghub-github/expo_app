-- ============================================================================
-- ENUM & FOREIGN KEY FIXES
-- Migration: 0019_enum_and_fk_fixes
-- Database: Supabase PostgreSQL
-- 
-- This migration fixes all enum conflicts and foreign key type mismatches
-- Run this AFTER all other migrations to correct any issues
-- ============================================================================

-- ============================================================================
-- FIX ENUM CONFLICTS
-- ============================================================================

-- Fix 1: Consolidate provider_type and order_source_type
-- Rename provider_type to order_source_type for consistency
DO $$
BEGIN
  -- Check if provider_type exists
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provider_type') THEN
    -- Update all references
    ALTER TABLE provider_configs ALTER COLUMN provider_type TYPE order_source_type USING provider_type::text::order_source_type;
    ALTER TABLE webhook_events ALTER COLUMN provider_type TYPE order_source_type USING provider_type::text::order_source_type;
    ALTER TABLE provider_order_mapping ALTER COLUMN provider_type TYPE order_source_type USING provider_type::text::order_source_type;
    ALTER TABLE api_call_logs ALTER COLUMN provider_type TYPE order_source_type USING provider_type::text::order_source_type;
    ALTER TABLE order_sync_logs ALTER COLUMN provider_type TYPE order_source_type USING provider_type::text::order_source_type;
    ALTER TABLE order_conflicts ALTER COLUMN provider_type TYPE order_source_type USING provider_type::text::order_source_type;
    ALTER TABLE provider_commission_rules ALTER COLUMN provider_type TYPE order_source_type USING provider_type::text::order_source_type;
    ALTER TABLE provider_order_status_sync ALTER COLUMN provider_type TYPE order_source_type USING provider_type::text::order_source_type;
    ALTER TABLE provider_order_payment_mapping ALTER COLUMN provider_type TYPE order_source_type USING provider_type::text::order_source_type;
    ALTER TABLE provider_order_refund_mapping ALTER COLUMN provider_type TYPE order_source_type USING provider_type::text::order_source_type;
    ALTER TABLE provider_order_item_mapping ALTER COLUMN provider_type TYPE order_source_type USING provider_type::text::order_source_type;
    ALTER TABLE provider_order_conflicts ALTER COLUMN provider_type TYPE order_source_type USING provider_type::text::order_source_type;
    ALTER TABLE provider_order_analytics ALTER COLUMN provider_type TYPE order_source_type USING provider_type::text::order_source_type;
    ALTER TABLE provider_rider_mapping ALTER COLUMN provider_type TYPE order_source_type USING provider_type::text::order_source_type;
    ALTER TABLE merchant_store_provider_mapping ALTER COLUMN provider_type TYPE order_source_type USING provider_type::text::order_source_type;
    
    -- Drop old type
    DROP TYPE provider_type;
  END IF;
END $$;

-- Fix 2: Remove duplicate payment_status_type from 0002
-- The enhanced version in 0008 is more complete
-- This is informational - 0002 should be updated directly

-- ============================================================================
-- FIX FOREIGN KEY REFERENCES
-- ============================================================================

-- Ensure all order_id foreign keys use BIGINT
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE column_name = 'order_id' 
      AND data_type = 'integer'
      AND table_schema = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN order_id TYPE BIGINT', r.table_name);
  END LOOP;
END $$;

-- Ensure all merchant_id foreign keys use BIGINT
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE column_name LIKE '%merchant%id%'
      AND data_type = 'integer'
      AND table_schema = 'public'
      AND table_name != 'riders' -- riders table has its own ID scheme
  LOOP
    -- Check if it should be BIGINT (for merchant_stores references)
    IF r.table_name IN ('orders', 'order_items', 'customer_favorites', 'customer_ratings_given') THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE BIGINT', r.table_name, r.column_name);
    END IF;
  END LOOP;
END $$;

-- Ensure all customer_id foreign keys use BIGINT
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE column_name = 'customer_id'
      AND data_type = 'integer'
      AND table_schema = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN customer_id TYPE BIGINT', r.table_name);
  END LOOP;
END $$;

-- ============================================================================
-- ADD MISSING FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- orders.customer_id should reference customers.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'orders_customer_id_fkey'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- orders.merchant_store_id should reference merchant_stores.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'orders_merchant_store_id_fkey'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_merchant_store_id_fkey
      FOREIGN KEY (merchant_store_id) REFERENCES merchant_stores(id) ON DELETE SET NULL;
  END IF;
END $$;

-- orders.merchant_parent_id should reference merchant_parents.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'orders_merchant_parent_id_fkey'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_merchant_parent_id_fkey
      FOREIGN KEY (merchant_parent_id) REFERENCES merchant_parents(id) ON DELETE SET NULL;
  END IF;
END $$;

-- order_items.merchant_menu_item_id should reference merchant_menu_items.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'order_items_merchant_menu_item_id_fkey'
  ) THEN
    ALTER TABLE order_items
      ADD CONSTRAINT order_items_merchant_menu_item_id_fkey
      FOREIGN KEY (merchant_menu_item_id) REFERENCES merchant_menu_items(id) ON DELETE SET NULL;
  END IF;
END $$;

-- customer_tips_given.rider_id should reference riders.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'customer_tips_given_rider_id_fkey'
  ) THEN
    ALTER TABLE customer_tips_given
      ADD CONSTRAINT customer_tips_given_rider_id_fkey
      FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- customer_ratings_received.rider_id should reference riders.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'customer_ratings_received_rider_id_fkey'
  ) THEN
    ALTER TABLE customer_ratings_received
      ADD CONSTRAINT customer_ratings_received_rider_id_fkey
      FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- FIX INDEXES
-- ============================================================================

-- Recreate indexes if needed after type changes
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders(customer_id);
CREATE INDEX IF NOT EXISTS orders_merchant_store_id_idx ON orders(merchant_store_id);
CREATE INDEX IF NOT EXISTS orders_merchant_parent_id_idx ON orders(merchant_parent_id);
CREATE INDEX IF NOT EXISTS order_items_merchant_menu_item_id_idx ON order_items(merchant_menu_item_id);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify no orphaned orders
DO $$
DECLARE
  v_orphaned_count INTEGER;
BEGIN
  -- Check orphaned customer references
  SELECT COUNT(*) INTO v_orphaned_count
  FROM orders o
  LEFT JOIN customers c ON o.customer_id = c.id
  WHERE o.customer_id IS NOT NULL AND c.id IS NULL;
  
  IF v_orphaned_count > 0 THEN
    RAISE WARNING 'Found % orders with invalid customer_id', v_orphaned_count;
  END IF;
  
  -- Check orphaned merchant references
  SELECT COUNT(*) INTO v_orphaned_count
  FROM orders o
  LEFT JOIN merchant_stores ms ON o.merchant_store_id = ms.id
  WHERE o.merchant_store_id IS NOT NULL AND ms.id IS NULL;
  
  IF v_orphaned_count > 0 THEN
    RAISE WARNING 'Found % orders with invalid merchant_store_id', v_orphaned_count;
  END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON SCHEMA public IS 'GatiMitra Platform - Consolidated & Fixed Schema';
