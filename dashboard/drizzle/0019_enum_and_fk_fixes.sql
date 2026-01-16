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

-- Step 1: Create helper function outside DO block to avoid dollar-quote conflicts
CREATE OR REPLACE FUNCTION convert_provider_to_order_source(p_value TEXT)
RETURNS order_source_type AS $conv_func$
BEGIN
  RETURN p_value::order_source_type;
END;
$conv_func$ LANGUAGE plpgsql IMMUTABLE;

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Check if provider_type exists and order_source_type exists
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provider_type') 
     AND EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_source_type') THEN
    
    -- Step 2: Drop functions that depend on provider_type
    DROP FUNCTION IF EXISTS get_provider_config(provider_type) CASCADE;
    DROP FUNCTION IF EXISTS order_exists_from_provider(provider_type, TEXT) CASCADE;
    
    -- Step 3: Convert all columns that use provider_type to order_source_type
    -- Use the helper function to avoid type comparison issues
    -- For orders.source, we need to drop ALL dependencies first
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'orders' AND column_name = 'source'
        AND udt_name = 'provider_type'
    ) THEN
      -- Step 3a: Use SAFE conversion approach for orders.source
      -- This avoids type comparison errors by using a temporary text column
      
      -- Drop indexes that include source column
      DROP INDEX IF EXISTS orders_source_idx CASCADE;
      DROP INDEX IF EXISTS orders_source_provider_order_id_idx CASCADE;
      
      -- Drop ALL check constraints on orders table
      FOR r IN 
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'orders'::regclass
          AND contype = 'c'
      LOOP
        EXECUTE format('ALTER TABLE orders DROP CONSTRAINT IF EXISTS %I CASCADE', r.conname);
      END LOOP;
      
      -- Drop ALL triggers on orders table
      FOR r IN
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_table = 'orders'
      LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON orders CASCADE', r.trigger_name);
      END LOOP;
      
      -- Drop views/materialized views that might reference orders.source
      DROP VIEW IF EXISTS active_orders_with_rider CASCADE;
      DROP VIEW IF EXISTS provider_sync_status CASCADE;
      DROP VIEW IF EXISTS rider_performance_by_order_type CASCADE;
      DROP MATERIALIZED VIEW IF EXISTS provider_performance_summary CASCADE;
      DROP MATERIALIZED VIEW IF EXISTS order_source_distribution CASCADE;
      
      -- Step 3b: SAFE conversion using temporary text column
      -- This completely avoids type comparison during conversion
      
      -- Create temporary text column
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_temp_text TEXT;
      
      -- Copy data from source to temp column
      UPDATE orders SET source_temp_text = source::text WHERE source IS NOT NULL;
      
      -- Drop the old column (this is safe now - no dependencies)
      ALTER TABLE orders DROP COLUMN source CASCADE;
      
      -- Add new column with correct type
      ALTER TABLE orders ADD COLUMN source order_source_type NOT NULL DEFAULT 'internal'::order_source_type;
      
      -- Copy data from temp to new column
      UPDATE orders SET source = source_temp_text::order_source_type WHERE source_temp_text IS NOT NULL;
      
      -- Drop temporary column
      ALTER TABLE orders DROP COLUMN source_temp_text;
      
      -- Step 3c: Recreate indexes
      CREATE INDEX IF NOT EXISTS orders_source_idx ON orders(source);
      CREATE INDEX IF NOT EXISTS orders_source_provider_order_id_idx 
        ON orders(source, provider_order_id) WHERE provider_order_id IS NOT NULL;
      
      -- Note: CHECK constraints, triggers, and views will need to be recreated
      -- in a later migration or manually if they are needed
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'provider_configs' AND column_name = 'provider_type'
        AND udt_name = 'provider_type'
    ) THEN
      -- Drop indexes and constraints first
      DROP INDEX IF EXISTS provider_configs_provider_type_idx CASCADE;
      ALTER TABLE provider_configs ALTER COLUMN provider_type TYPE order_source_type 
        USING convert_provider_to_order_source(provider_type::text);
      -- Recreate index
      CREATE INDEX IF NOT EXISTS provider_configs_provider_type_idx ON provider_configs(provider_type);
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'webhook_events' AND column_name = 'provider_type'
        AND udt_name = 'provider_type'
    ) THEN
      DROP INDEX IF EXISTS webhook_events_provider_type_idx CASCADE;
      ALTER TABLE webhook_events ALTER COLUMN provider_type TYPE order_source_type 
        USING convert_provider_to_order_source(provider_type::text);
      CREATE INDEX IF NOT EXISTS webhook_events_provider_type_idx ON webhook_events(provider_type);
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'provider_order_mapping' AND column_name = 'provider_type'
        AND udt_name = 'provider_type'
    ) THEN
      DROP INDEX IF EXISTS provider_order_mapping_provider_type_idx CASCADE;
      DROP INDEX IF EXISTS provider_order_mapping_order_provider_idx CASCADE;
      ALTER TABLE provider_order_mapping ALTER COLUMN provider_type TYPE order_source_type 
        USING convert_provider_to_order_source(provider_type::text);
      CREATE INDEX IF NOT EXISTS provider_order_mapping_provider_type_idx ON provider_order_mapping(provider_type);
      CREATE INDEX IF NOT EXISTS provider_order_mapping_order_provider_idx ON provider_order_mapping(order_id, provider_type);
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'api_call_logs' AND column_name = 'provider_type'
        AND udt_name = 'provider_type'
    ) THEN
      DROP INDEX IF EXISTS api_call_logs_provider_type_idx CASCADE;
      ALTER TABLE api_call_logs ALTER COLUMN provider_type TYPE order_source_type 
        USING convert_provider_to_order_source(provider_type::text);
      CREATE INDEX IF NOT EXISTS api_call_logs_provider_type_idx ON api_call_logs(provider_type);
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'order_sync_logs' AND column_name = 'provider_type'
        AND udt_name = 'provider_type'
    ) THEN
      DROP INDEX IF EXISTS order_sync_logs_provider_type_idx CASCADE;
      ALTER TABLE order_sync_logs ALTER COLUMN provider_type TYPE order_source_type 
        USING convert_provider_to_order_source(provider_type::text);
      CREATE INDEX IF NOT EXISTS order_sync_logs_provider_type_idx ON order_sync_logs(provider_type);
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'order_conflicts' AND column_name = 'provider_type'
        AND udt_name = 'provider_type'
    ) THEN
      DROP INDEX IF EXISTS order_conflicts_provider_type_idx CASCADE;
      ALTER TABLE order_conflicts ALTER COLUMN provider_type TYPE order_source_type 
        USING convert_provider_to_order_source(provider_type::text);
      CREATE INDEX IF NOT EXISTS order_conflicts_provider_type_idx ON order_conflicts(provider_type);
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'provider_commission_rules' AND column_name = 'provider_type'
        AND udt_name = 'provider_type'
    ) THEN
      DROP INDEX IF EXISTS provider_commission_rules_provider_type_idx CASCADE;
      DROP INDEX IF EXISTS provider_commission_rules_active_unique_idx CASCADE;
      ALTER TABLE provider_commission_rules ALTER COLUMN provider_type TYPE order_source_type 
        USING convert_provider_to_order_source(provider_type::text);
      CREATE INDEX IF NOT EXISTS provider_commission_rules_provider_type_idx ON provider_commission_rules(provider_type);
      CREATE UNIQUE INDEX IF NOT EXISTS provider_commission_rules_active_unique_idx
        ON provider_commission_rules(provider_type, order_type, effective_from)
        WHERE effective_to IS NULL;
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'provider_rate_limits' AND column_name = 'provider_type'
        AND udt_name = 'provider_type'
    ) THEN
      DROP INDEX IF EXISTS provider_rate_limits_provider_endpoint_idx CASCADE;
      ALTER TABLE provider_rate_limits ALTER COLUMN provider_type TYPE order_source_type 
        USING convert_provider_to_order_source(provider_type::text);
      CREATE INDEX IF NOT EXISTS provider_rate_limits_provider_endpoint_idx ON provider_rate_limits(provider_type, endpoint);
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'webhook_configurations' AND column_name = 'provider_type'
        AND udt_name = 'provider_type'
    ) THEN
      DROP INDEX IF EXISTS webhook_configurations_provider_type_idx CASCADE;
      ALTER TABLE webhook_configurations ALTER COLUMN provider_type TYPE order_source_type 
        USING convert_provider_to_order_source(provider_type::text);
      CREATE INDEX IF NOT EXISTS webhook_configurations_provider_type_idx ON webhook_configurations(provider_type);
    END IF;
    
    -- Convert columns in tables from 0009
    -- Drop indexes/constraints before conversion, recreate after
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'provider_order_status_sync' AND column_name = 'provider_type'
        AND udt_name = 'provider_type'
    ) THEN
      -- Drop any indexes on this column
      DROP INDEX IF EXISTS provider_order_status_sync_provider_type_idx CASCADE;
      ALTER TABLE provider_order_status_sync ALTER COLUMN provider_type TYPE order_source_type 
        USING convert_provider_to_order_source(provider_type::text);
      CREATE INDEX IF NOT EXISTS provider_order_status_sync_provider_type_idx ON provider_order_status_sync(provider_type);
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'provider_order_payment_mapping' AND column_name = 'provider_type'
        AND udt_name = 'provider_type'
    ) THEN
      DROP INDEX IF EXISTS provider_order_payment_mapping_provider_type_idx CASCADE;
      ALTER TABLE provider_order_payment_mapping ALTER COLUMN provider_type TYPE order_source_type 
        USING convert_provider_to_order_source(provider_type::text);
      CREATE INDEX IF NOT EXISTS provider_order_payment_mapping_provider_type_idx ON provider_order_payment_mapping(provider_type);
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'provider_order_refund_mapping' AND column_name = 'provider_type'
        AND udt_name = 'provider_type'
    ) THEN
      DROP INDEX IF EXISTS provider_order_refund_mapping_provider_type_idx CASCADE;
      ALTER TABLE provider_order_refund_mapping ALTER COLUMN provider_type TYPE order_source_type 
        USING convert_provider_to_order_source(provider_type::text);
      CREATE INDEX IF NOT EXISTS provider_order_refund_mapping_provider_type_idx ON provider_order_refund_mapping(provider_type);
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'provider_order_item_mapping' AND column_name = 'provider_type'
        AND udt_name = 'provider_type'
    ) THEN
      DROP INDEX IF EXISTS provider_order_item_mapping_provider_type_idx CASCADE;
      ALTER TABLE provider_order_item_mapping ALTER COLUMN provider_type TYPE order_source_type 
        USING convert_provider_to_order_source(provider_type::text);
      CREATE INDEX IF NOT EXISTS provider_order_item_mapping_provider_type_idx ON provider_order_item_mapping(provider_type);
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'provider_order_conflicts' AND column_name = 'provider_type'
        AND udt_name = 'provider_type'
    ) THEN
      DROP INDEX IF EXISTS provider_order_conflicts_provider_type_idx CASCADE;
      ALTER TABLE provider_order_conflicts ALTER COLUMN provider_type TYPE order_source_type 
        USING convert_provider_to_order_source(provider_type::text);
      CREATE INDEX IF NOT EXISTS provider_order_conflicts_provider_type_idx ON provider_order_conflicts(provider_type);
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'provider_order_analytics' AND column_name = 'provider_type'
        AND udt_name = 'provider_type'
    ) THEN
      DROP INDEX IF EXISTS provider_order_analytics_provider_type_idx CASCADE;
      ALTER TABLE provider_order_analytics ALTER COLUMN provider_type TYPE order_source_type 
        USING convert_provider_to_order_source(provider_type::text);
      CREATE INDEX IF NOT EXISTS provider_order_analytics_provider_type_idx ON provider_order_analytics(provider_type);
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'provider_rider_mapping' AND column_name = 'provider_type'
        AND udt_name = 'provider_type'
    ) THEN
      DROP INDEX IF EXISTS provider_rider_mapping_provider_type_idx CASCADE;
      ALTER TABLE provider_rider_mapping ALTER COLUMN provider_type TYPE order_source_type 
        USING convert_provider_to_order_source(provider_type::text);
      CREATE INDEX IF NOT EXISTS provider_rider_mapping_provider_type_idx ON provider_rider_mapping(provider_type);
    END IF;
    
    -- Step 4: Recreate functions with order_source_type
    -- Use EXECUTE with different dollar-quote tags to avoid conflicts
    EXECUTE $sql1$
      CREATE OR REPLACE FUNCTION get_provider_config(p_provider order_source_type)
      RETURNS TABLE (
        id BIGINT,
        provider_type order_source_type,
        api_base_url TEXT,
        status integration_status,
        metadata JSONB
      ) AS $body1$
      BEGIN
        RETURN QUERY
        SELECT 
          pc.id,
          pc.provider_type,
          pc.api_base_url,
          pc.status,
          pc.metadata
        FROM provider_configs pc
        WHERE pc.provider_type = p_provider
          AND pc.status = 'active'
        LIMIT 1;
      END;
      $body1$ LANGUAGE plpgsql SECURITY DEFINER;
    $sql1$;
    
    EXECUTE $sql2$
      CREATE OR REPLACE FUNCTION order_exists_from_provider(
        p_provider order_source_type,
        p_provider_order_id TEXT
      )
      RETURNS BOOLEAN AS $body2$
      DECLARE
        v_exists BOOLEAN;
      BEGIN
        SELECT EXISTS(
          SELECT 1 FROM orders
          WHERE source = p_provider
            AND provider_order_id = p_provider_order_id
        ) INTO v_exists;
        RETURN v_exists;
      END;
      $body2$ LANGUAGE plpgsql;
    $sql2$;
    
    -- Step 5: Drop old type (now safe since all dependencies are converted)
    DROP TYPE provider_type;
  END IF;
END $$;

-- Step 6: Drop the helper function after all conversions are done
DROP FUNCTION IF EXISTS convert_provider_to_order_source(TEXT);

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
