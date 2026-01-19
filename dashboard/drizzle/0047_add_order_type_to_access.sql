-- Add Order Type to Access Control Tables
-- Migration: 0047_add_order_type_to_access
-- Changes: Add orderType column to dashboard_access, dashboard_access_points, and action_audit_log tables

-- ============================================================================
-- STEP 1: Add orderType column to dashboard_access table
-- ============================================================================

ALTER TABLE dashboard_access
  ADD COLUMN IF NOT EXISTS order_type TEXT;

COMMENT ON COLUMN dashboard_access.order_type IS 
  'Order type for order-related dashboards. NULL = access to all order types, specific value = access to that type only';

-- ============================================================================
-- STEP 2: Add orderType column to dashboard_access_points table
-- ============================================================================

ALTER TABLE dashboard_access_points
  ADD COLUMN IF NOT EXISTS order_type TEXT;

COMMENT ON COLUMN dashboard_access_points.order_type IS 
  'Order type for order-related dashboards. NULL = access to all order types, specific value = access to that type only';

-- ============================================================================
-- STEP 3: Add orderType column to action_audit_log table
-- ============================================================================

ALTER TABLE action_audit_log
  ADD COLUMN IF NOT EXISTS order_type TEXT;

COMMENT ON COLUMN action_audit_log.order_type IS 
  'Order type for order-related actions';

-- ============================================================================
-- STEP 4: Create indexes for better query performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS dashboard_access_order_type_idx 
  ON dashboard_access(order_type) 
  WHERE order_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS dashboard_access_points_order_type_idx 
  ON dashboard_access_points(order_type) 
  WHERE order_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS action_audit_log_order_type_idx 
  ON action_audit_log(order_type) 
  WHERE order_type IS NOT NULL;

-- ============================================================================
-- STEP 5: Update unique constraint on dashboard_access_points if needed
-- Note: The unique constraint already includes dashboard_type, so order_type
-- should be considered when checking for duplicates. However, we'll keep the
-- existing constraint and handle order_type filtering in application logic.
-- ============================================================================
