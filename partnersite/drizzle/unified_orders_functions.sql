-- ============================================================================
-- UNIFIED ORDERS FUNCTIONS AND TRIGGERS
-- Production-Grade Database Functions and Triggers
-- Auto-sync, validation, and helper functions
-- Migration: unified_orders_functions
-- Database: PostgreSQL
-- ORM: Drizzle
-- 
-- DESIGN PRINCIPLES:
-- - Auto-Sync: Automatic syncing of denormalized fields
-- - Validation: Data validation and constraint enforcement
-- - Helper Functions: Utility functions for common operations
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function: Update updated_at timestamp (generic)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Generate formatted order ID
CREATE OR REPLACE FUNCTION generate_formatted_order_id(order_id BIGINT)
RETURNS TEXT AS $$
BEGIN
  RETURN 'ORD-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(order_id::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Calculate order totals from items
CREATE OR REPLACE FUNCTION calculate_order_totals(p_order_id BIGINT)
RETURNS TABLE (
  total_item_value NUMERIC,
  total_tax NUMERIC,
  total_discount NUMERIC,
  total_payable NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(oi.final_item_price * oi.quantity), 0) AS total_item_value,
    COALESCE(SUM(oi.tax_amount), 0) AS total_tax,
    COALESCE(SUM(oi.discount_amount), 0) AS total_discount,
    COALESCE(SUM(oi.final_item_price * oi.quantity + oi.tax_amount - oi.discount_amount), 0) AS total_payable
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ORDER STATUS SYNC FUNCTIONS
-- ============================================================================

-- Function: Sync order status to timeline
CREATE OR REPLACE FUNCTION sync_order_status_to_timeline()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create timeline entry if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.order_timeline (
      order_id,
      status,
      previous_status,
      actor_type,
      actor_id,
      actor_name,
      occurred_at,
      status_metadata
    ) VALUES (
      NEW.id,
      NEW.status,
      OLD.status,
      COALESCE(NEW.cancelled_by, 'system'),
      COALESCE(NEW.cancelled_by_id, NULL),
      NULL,
      NOW(),
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'updated_at', NEW.updated_at
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Update order current_status from timeline
CREATE OR REPLACE FUNCTION update_order_current_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.orders
  SET current_status = NEW.status::TEXT,
      updated_at = NOW()
  WHERE id = NEW.order_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Update order current_rider_id from active assignment
CREATE OR REPLACE FUNCTION update_order_current_rider()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if this is an active assignment
  IF NEW.assignment_status IN ('pending', 'assigned', 'accepted') THEN
    UPDATE public.orders
    SET current_rider_id = NEW.rider_id,
        updated_at = NOW()
    WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VALIDATION FUNCTIONS
-- ============================================================================

-- Function: Validate chronological order in timeline
CREATE OR REPLACE FUNCTION validate_timeline_chronological_order()
RETURNS TRIGGER AS $$
DECLARE
  v_previous_occurred_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get the most recent occurred_at for this order
  SELECT MAX(occurred_at) INTO v_previous_occurred_at
  FROM public.order_timeline
  WHERE order_id = NEW.order_id
    AND id != NEW.id;
  
  -- If there's a previous entry, ensure new one is not before it
  IF v_previous_occurred_at IS NOT NULL AND NEW.occurred_at < v_previous_occurred_at THEN
    RAISE EXCEPTION 'Timeline entry occurred_at (%) cannot be before previous entry (%)', 
      NEW.occurred_at, v_previous_occurred_at;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Validate only one active rider assignment per order
CREATE OR REPLACE FUNCTION validate_single_active_assignment()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_active_count INTEGER;
BEGIN
  -- Count existing active assignments for this order
  SELECT COUNT(*) INTO v_existing_active_count
  FROM public.order_rider_assignments
  WHERE order_id = NEW.order_id
    AND assignment_status IN ('pending', 'assigned', 'accepted')
    AND id != NEW.id;
  
  -- If trying to create/update to active status and another active assignment exists, raise error
  IF NEW.assignment_status IN ('pending', 'assigned', 'accepted') AND v_existing_active_count > 0 THEN
    RAISE EXCEPTION 'Order % already has an active rider assignment. Cancel existing assignment before creating new one.', NEW.order_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- AUDIT LOG FUNCTIONS
-- ============================================================================

-- Function: Create audit log entry from timeline
CREATE OR REPLACE FUNCTION create_order_audit_log_from_timeline()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.order_audit_log (
    order_id,
    action_type,
    action_field,
    old_value,
    new_value,
    actor_type,
    actor_id,
    actor_name,
    created_at
  ) VALUES (
    NEW.order_id,
    'status_change',
    'status',
    jsonb_build_object('status', OLD.status),
    jsonb_build_object('status', NEW.status),
    NEW.actor_type,
    NEW.actor_id,
    NEW.actor_name,
    NEW.occurred_at
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS FOR ORDERS TABLE
-- ============================================================================

-- Trigger: Auto-update updated_at timestamp
DROP TRIGGER IF EXISTS orders_updated_at_trigger ON public.orders;
CREATE TRIGGER orders_updated_at_trigger
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Sync status changes to timeline
DROP TRIGGER IF EXISTS orders_status_change_trigger ON public.orders;
CREATE TRIGGER orders_status_change_trigger
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION sync_order_status_to_timeline();

-- Trigger: Auto-generate formatted_order_id on insert
CREATE OR REPLACE FUNCTION generate_formatted_order_id_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.formatted_order_id IS NULL THEN
    NEW.formatted_order_id = generate_formatted_order_id(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_generate_formatted_id_trigger ON public.orders;
CREATE TRIGGER orders_generate_formatted_id_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_formatted_order_id_trigger();

-- ============================================================================
-- TRIGGERS FOR ORDER TIMELINE TABLE
-- ============================================================================

-- Trigger: Update orders.current_status from timeline
DROP TRIGGER IF EXISTS orders_timeline_sync_trigger ON public.order_timeline;
CREATE TRIGGER orders_timeline_sync_trigger
  AFTER INSERT ON public.order_timeline
  FOR EACH ROW
  EXECUTE FUNCTION update_order_current_status();

-- Trigger: Create audit log entry from timeline
DROP TRIGGER IF EXISTS order_timeline_audit_trigger ON public.order_timeline;
CREATE TRIGGER order_timeline_audit_trigger
  AFTER INSERT ON public.order_timeline
  FOR EACH ROW
  EXECUTE FUNCTION create_order_audit_log_from_timeline();

-- Trigger: Validate chronological order
DROP TRIGGER IF EXISTS order_timeline_chronological_trigger ON public.order_timeline;
CREATE TRIGGER order_timeline_chronological_trigger
  BEFORE INSERT ON public.order_timeline
  FOR EACH ROW
  EXECUTE FUNCTION validate_timeline_chronological_order();

-- ============================================================================
-- TRIGGERS FOR ORDER RIDER ASSIGNMENTS TABLE
-- ============================================================================

-- Trigger: Update updated_at timestamp
DROP TRIGGER IF EXISTS order_rider_assignments_updated_at_trigger ON public.order_rider_assignments;
CREATE TRIGGER order_rider_assignments_updated_at_trigger
  BEFORE UPDATE ON public.order_rider_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update orders.current_rider_id when assignment becomes active
DROP TRIGGER IF EXISTS order_rider_assignments_update_current_rider_trigger ON public.order_rider_assignments;
CREATE TRIGGER order_rider_assignments_update_current_rider_trigger
  AFTER INSERT OR UPDATE ON public.order_rider_assignments
  FOR EACH ROW
  WHEN (NEW.assignment_status IN ('pending', 'assigned', 'accepted'))
  EXECUTE FUNCTION update_order_current_rider();

-- Trigger: Validate only one active assignment per order
DROP TRIGGER IF EXISTS order_rider_assignments_validate_single_active_trigger ON public.order_rider_assignments;
CREATE TRIGGER order_rider_assignments_validate_single_active_trigger
  BEFORE INSERT OR UPDATE ON public.order_rider_assignments
  FOR EACH ROW
  WHEN (NEW.assignment_status IN ('pending', 'assigned', 'accepted'))
  EXECUTE FUNCTION validate_single_active_assignment();

-- ============================================================================
-- TRIGGERS FOR ORDER PAYMENTS TABLE
-- ============================================================================

-- Trigger: Update updated_at timestamp
DROP TRIGGER IF EXISTS order_payments_updated_at_trigger ON public.order_payments;
CREATE TRIGGER order_payments_updated_at_trigger
  BEFORE UPDATE ON public.order_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGERS FOR ORDER TICKETS TABLE
-- ============================================================================

-- Trigger: Update updated_at timestamp
DROP TRIGGER IF EXISTS order_tickets_updated_at_trigger ON public.order_tickets;
CREATE TRIGGER order_tickets_updated_at_trigger
  BEFORE UPDATE ON public.order_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGERS FOR ORDER DISPUTES TABLE
-- ============================================================================

-- Trigger: Update updated_at timestamp
DROP TRIGGER IF EXISTS order_disputes_updated_at_trigger ON public.order_disputes;
CREATE TRIGGER order_disputes_updated_at_trigger
  BEFORE UPDATE ON public.order_disputes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGERS FOR SERVICE-SPECIFIC TABLES
-- ============================================================================

-- Trigger: Update order_food_details updated_at
DROP TRIGGER IF EXISTS order_food_details_updated_at_trigger ON public.order_food_details;
CREATE TRIGGER order_food_details_updated_at_trigger
  BEFORE UPDATE ON public.order_food_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update order_parcel_details updated_at
DROP TRIGGER IF EXISTS order_parcel_details_updated_at_trigger ON public.order_parcel_details;
CREATE TRIGGER order_parcel_details_updated_at_trigger
  BEFORE UPDATE ON public.order_parcel_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update order_ride_details updated_at
DROP TRIGGER IF EXISTS order_ride_details_updated_at_trigger ON public.order_ride_details;
CREATE TRIGGER order_ride_details_updated_at_trigger
  BEFORE UPDATE ON public.order_ride_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGERS FOR PROVIDER TABLES
-- ============================================================================

-- Trigger: Update order_providers updated_at
DROP TRIGGER IF EXISTS order_providers_updated_at_trigger ON public.order_providers;
CREATE TRIGGER order_providers_updated_at_trigger
  BEFORE UPDATE ON public.order_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update order_provider_mapping updated_at
DROP TRIGGER IF EXISTS order_provider_mapping_updated_at_trigger ON public.order_provider_mapping;
CREATE TRIGGER order_provider_mapping_updated_at_trigger
  BEFORE UPDATE ON public.order_provider_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update provider_order_analytics updated_at
DROP TRIGGER IF EXISTS provider_order_analytics_updated_at_trigger ON public.provider_order_analytics;
CREATE TRIGGER provider_order_analytics_updated_at_trigger
  BEFORE UPDATE ON public.provider_order_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION sync_order_status_to_timeline() IS 'Automatically creates timeline entry when order status changes.';
COMMENT ON FUNCTION update_order_current_status() IS 'Updates orders.current_status from order_timeline.';
COMMENT ON FUNCTION update_order_current_rider() IS 'Updates orders.current_rider_id from active rider assignment.';
COMMENT ON FUNCTION generate_formatted_order_id(BIGINT) IS 'Generates human-readable order ID (e.g., ORD-2024-001234).';
COMMENT ON FUNCTION calculate_order_totals(BIGINT) IS 'Calculates order totals from order_items. Returns total_item_value, total_tax, total_discount, total_payable.';
COMMENT ON FUNCTION validate_timeline_chronological_order() IS 'Validates that timeline entries are in chronological order.';
COMMENT ON FUNCTION validate_single_active_assignment() IS 'Validates that only one active rider assignment exists per order.';
