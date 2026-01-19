-- Update Order Type Enum
-- Migration: 0046_update_order_type_enum
-- Changes: Replace 'ride' with 'person_ride' and remove '3pl' from order_type enum

-- ============================================================================
-- STEP 0: Drop all views and materialized views that depend on order_type
-- ============================================================================

-- Drop materialized views that depend on order_type
DROP MATERIALIZED VIEW IF EXISTS provider_performance_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS order_source_distribution CASCADE;
DROP MATERIALIZED VIEW IF EXISTS rider_performance_by_order_type CASCADE;

-- Drop regular views that depend on order_type
DROP VIEW IF EXISTS active_orders_with_rider CASCADE;

-- Note: provider_sync_status view doesn't use order_type, so we don't need to drop it

-- ============================================================================
-- STEP 1: Convert column to TEXT temporarily to allow any value
-- ============================================================================

-- First, we need to change the column type temporarily to TEXT
-- This allows us to update values that don't exist in the current enum
ALTER TABLE orders 
  ALTER COLUMN order_type TYPE TEXT;

-- Also update other tables that use order_type enum
-- Check and update commission_history if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'commission_history' AND column_name = 'order_type') THEN
    ALTER TABLE commission_history ALTER COLUMN order_type TYPE TEXT;
  END IF;
END $$;

-- Check and update customer_orders_summary if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'customer_orders_summary' AND column_name = 'order_type') THEN
    ALTER TABLE customer_orders_summary ALTER COLUMN order_type TYPE TEXT;
  END IF;
END $$;

-- Check and update merchant_store_orders if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'merchant_store_orders' AND column_name = 'order_type') THEN
    ALTER TABLE merchant_store_orders ALTER COLUMN order_type TYPE TEXT;
  END IF;
END $$;

-- Check and update provider_commission_rules if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'provider_commission_rules' AND column_name = 'order_type') THEN
    ALTER TABLE provider_commission_rules ALTER COLUMN order_type TYPE TEXT;
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Update existing data - Convert 'ride' to 'person_ride' and remove '3pl'
-- ============================================================================

-- Update orders table
UPDATE orders
SET order_type = 'person_ride'
WHERE order_type = 'ride';

-- Delete or handle '3pl' orders (you may want to migrate these differently)
-- For now, we'll convert them to 'parcel' as a default, but you may want to handle this differently
UPDATE orders
SET order_type = 'parcel'
WHERE order_type = '3pl';

-- Update commission_history if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'commission_history') THEN
    UPDATE commission_history
    SET order_type = 'person_ride'
    WHERE order_type = 'ride';
    
    UPDATE commission_history
    SET order_type = 'parcel'
    WHERE order_type = '3pl';
  END IF;
END $$;

-- Update customer_orders_summary if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_orders_summary') THEN
    UPDATE customer_orders_summary
    SET order_type = 'person_ride'
    WHERE order_type = 'ride';
    
    UPDATE customer_orders_summary
    SET order_type = 'parcel'
    WHERE order_type = '3pl';
  END IF;
END $$;

-- Update merchant_store_orders if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_store_orders') THEN
    UPDATE merchant_store_orders
    SET order_type = 'person_ride'
    WHERE order_type = 'ride';
    
    UPDATE merchant_store_orders
    SET order_type = 'parcel'
    WHERE order_type = '3pl';
  END IF;
END $$;

-- Update provider_commission_rules if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'provider_commission_rules') THEN
    UPDATE provider_commission_rules
    SET order_type = 'person_ride'
    WHERE order_type = 'ride';
    
    UPDATE provider_commission_rules
    SET order_type = 'parcel'
    WHERE order_type = '3pl';
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Drop and recreate the enum type
-- ============================================================================

-- Drop the old enum (CASCADE will handle dependent objects)
DROP TYPE IF EXISTS order_type CASCADE;

-- Create new enum with updated values
CREATE TYPE order_type AS ENUM (
  'food',
  'parcel',
  'person_ride'
);

-- ============================================================================
-- STEP 4: Convert columns back to use the new enum
-- ============================================================================

-- Change orders column back to use the new enum
ALTER TABLE orders 
  ALTER COLUMN order_type TYPE order_type USING order_type::order_type;

-- Convert commission_history back if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'commission_history' AND column_name = 'order_type' 
             AND data_type = 'text') THEN
    ALTER TABLE commission_history 
      ALTER COLUMN order_type TYPE order_type USING order_type::order_type;
  END IF;
END $$;

-- Convert customer_orders_summary back if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'customer_orders_summary' AND column_name = 'order_type' 
             AND data_type = 'text') THEN
    ALTER TABLE customer_orders_summary 
      ALTER COLUMN order_type TYPE order_type USING order_type::order_type;
  END IF;
END $$;

-- Convert merchant_store_orders back if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'merchant_store_orders' AND column_name = 'order_type' 
             AND data_type = 'text') THEN
    ALTER TABLE merchant_store_orders 
      ALTER COLUMN order_type TYPE order_type USING order_type::order_type;
  END IF;
END $$;

-- Convert provider_commission_rules back if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'provider_commission_rules' AND column_name = 'order_type' 
             AND data_type = 'text') THEN
    ALTER TABLE provider_commission_rules 
      ALTER COLUMN order_type TYPE order_type USING order_type::order_type;
  END IF;
END $$;

-- ============================================================================
-- STEP 5: Recreate any constraints or indexes that were dropped
-- ============================================================================

-- Recreate index if it was dropped
CREATE INDEX IF NOT EXISTS orders_order_type_idx ON orders(order_type);

-- ============================================================================
-- STEP 6: Recreate materialized views and views that were dropped
-- ============================================================================

-- Recreate provider_performance_summary materialized view
CREATE MATERIALIZED VIEW provider_performance_summary AS
SELECT 
  o.source AS provider_type,
  o.order_type,
  COUNT(*) AS total_orders,
  COUNT(*) FILTER (WHERE o.status = 'delivered') AS completed_orders,
  COUNT(*) FILTER (WHERE o.status = 'cancelled') AS cancelled_orders,
  AVG(EXTRACT(EPOCH FROM (o.actual_delivery_time - o.actual_pickup_time))/60) AS avg_delivery_time_minutes,
  AVG(o.fare_amount) AS avg_fare_amount,
  SUM(o.fare_amount) AS total_fare_amount,
  SUM(o.commission_amount) AS total_commission,
  SUM(o.rider_earning) AS total_rider_earning,
  COUNT(*) FILTER (WHERE o.synced_with_provider = TRUE) AS synced_orders,
  COUNT(*) FILTER (WHERE o.synced_with_provider = FALSE) AS unsynced_orders
FROM orders o
WHERE o.source != 'internal'
GROUP BY o.source, o.order_type;

CREATE UNIQUE INDEX IF NOT EXISTS provider_performance_summary_pkey 
  ON provider_performance_summary(provider_type, order_type);

-- Recreate order_source_distribution materialized view
CREATE MATERIALIZED VIEW order_source_distribution AS
SELECT 
  o.source,
  o.order_type,
  DATE_TRUNC('day', o.created_at) AS order_date,
  COUNT(*) AS order_count,
  SUM(o.fare_amount) AS total_revenue,
  AVG(o.fare_amount) AS avg_order_value
FROM orders o
GROUP BY o.source, o.order_type, DATE_TRUNC('day', o.created_at);

CREATE UNIQUE INDEX IF NOT EXISTS order_source_distribution_pkey 
  ON order_source_distribution(source, order_type, order_date);

-- Recreate rider_performance_by_order_type materialized view
CREATE MATERIALIZED VIEW rider_performance_by_order_type AS
SELECT 
  o.rider_id,
  o.order_type,
  COUNT(*) AS total_orders,
  COUNT(*) FILTER (WHERE o.status = 'delivered') AS completed_orders,
  COUNT(*) FILTER (WHERE o.status = 'cancelled') AS cancelled_orders,
  AVG(EXTRACT(EPOCH FROM (o.actual_delivery_time - o.actual_pickup_time))/60) AS avg_delivery_time_minutes,
  SUM(o.rider_earning) AS total_earnings,
  AVG(o.rider_earning) AS avg_earnings_per_order,
  AVG(o.customer_rating) AS avg_customer_rating
FROM orders o
WHERE o.rider_id IS NOT NULL
GROUP BY o.rider_id, o.order_type;

CREATE UNIQUE INDEX IF NOT EXISTS rider_performance_by_order_type_pkey 
  ON rider_performance_by_order_type(rider_id, order_type);

-- Recreate active_orders_with_rider view
CREATE VIEW active_orders_with_rider AS
SELECT 
  o.id AS order_id,
  o.order_type,
  o.status,
  o.rider_id,
  r.name AS rider_name,
  r.mobile AS rider_mobile,
  o.customer_id,
  o.merchant_store_id,
  o.pickup_address,
  o.drop_address,
  o.fare_amount,
  o.rider_earning,
  o.created_at,
  o.estimated_delivery_time,
  ora.assignment_status,
  ora.distance_to_pickup_km
FROM orders o
LEFT JOIN riders r ON o.rider_id = r.id
LEFT JOIN order_rider_assignments ora ON o.id = ora.order_id 
  AND ora.assignment_status IN ('pending', 'assigned', 'accepted')
WHERE o.status NOT IN ('delivered', 'cancelled', 'failed');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TYPE order_type IS 'Order type enum: food, parcel, person_ride';
COMMENT ON MATERIALIZED VIEW provider_performance_summary IS 'Summary of provider performance metrics by order type';
COMMENT ON MATERIALIZED VIEW order_source_distribution IS 'Daily order distribution by source and type';
COMMENT ON MATERIALIZED VIEW rider_performance_by_order_type IS 'Rider performance metrics grouped by order type';
COMMENT ON VIEW active_orders_with_rider IS 'Real-time view of active orders with rider information';
