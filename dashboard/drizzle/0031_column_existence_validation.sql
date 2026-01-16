-- ============================================================================
-- COLUMN EXISTENCE VALIDATION
-- Migration: 0031_column_existence_validation
-- Database: Supabase PostgreSQL
-- 
-- This file validates that all columns referenced in indexes actually exist
-- and creates indexes only if columns exist (safe approach)
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTION: Check if column exists
-- ============================================================================

CREATE OR REPLACE FUNCTION column_exists(p_table_name TEXT, p_column_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = p_table_name 
      AND column_name = p_column_name
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- CONDITIONAL INDEXES - Only create if columns exist
-- ============================================================================

-- Order Disputes - raised_by (not raised_by_type)
DO $$
BEGIN
  IF column_exists('order_disputes', 'raised_by') THEN
    CREATE INDEX IF NOT EXISTS order_disputes_raised_by_idx ON order_disputes(raised_by, raised_by_id);
  END IF;
END $$;

-- Orders table - conditional indexes for columns that might not exist
DO $$
BEGIN
  -- Current status index (if column exists)
  IF column_exists('orders', 'current_status') THEN
    CREATE INDEX IF NOT EXISTS orders_current_status_idx ON orders(current_status) WHERE current_status IS NOT NULL;
  END IF;
  
  -- Payment status index (if column exists)
  IF column_exists('orders', 'payment_status') THEN
    CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON orders(payment_status);
  END IF;
  
  -- Payment method index (if column exists)
  IF column_exists('orders', 'payment_method') THEN
    CREATE INDEX IF NOT EXISTS orders_payment_method_idx ON orders(payment_method) WHERE payment_method IS NOT NULL;
  END IF;
  
  -- Source index (if column exists)
  IF column_exists('orders', 'source') THEN
    CREATE INDEX IF NOT EXISTS orders_source_idx ON orders(source);
  END IF;
  
  -- Provider order ID index (if column exists)
  IF column_exists('orders', 'provider_order_id') THEN
    CREATE INDEX IF NOT EXISTS orders_provider_order_id_idx ON orders(provider_order_id) WHERE provider_order_id IS NOT NULL;
  END IF;
  
  -- External order ID index (if column exists)
  IF column_exists('orders', 'external_order_id') THEN
    CREATE INDEX IF NOT EXISTS orders_external_order_id_idx ON orders(external_order_id) WHERE external_order_id IS NOT NULL;
  END IF;
  
  -- Order UUID index (if column exists)
  IF column_exists('orders', 'order_uuid') THEN
    CREATE INDEX IF NOT EXISTS orders_order_uuid_idx ON orders(order_uuid) WHERE order_uuid IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION column_exists(TEXT, TEXT) IS 'Helper function to check if a column exists in a table';
