-- ============================================================================
-- TRIGGERS AND FUNCTIONS
-- Migration: 0028_triggers_and_functions
-- Database: Supabase PostgreSQL
-- 
-- This file adds all missing triggers and functions for data validation,
-- automatic updates, and business logic enforcement
-- ============================================================================

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Function: Auto-update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ORDER TRIGGERS
-- ============================================================================

-- Trigger: Auto-update current_status in orders when timeline is updated
CREATE OR REPLACE FUNCTION update_order_current_status()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'current_status') THEN
    UPDATE orders
    SET current_status = NEW.status,
        updated_at = NOW()
    WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_timeline_update_status_trigger ON order_timeline;
CREATE TRIGGER order_timeline_update_status_trigger
  AFTER INSERT ON order_timeline
  FOR EACH ROW
  EXECUTE FUNCTION update_order_current_status();

-- Trigger: Auto-create audit log entry for order timeline
CREATE OR REPLACE FUNCTION create_order_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_audit_log') THEN
    INSERT INTO order_audit_log (
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
      row_to_json(OLD)::jsonb,
      row_to_json(NEW)::jsonb,
      NEW.actor_type,
      NEW.actor_id,
      NEW.actor_name,
      NEW.occurred_at
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_timeline_audit_trigger ON order_timeline;
CREATE TRIGGER order_timeline_audit_trigger
  AFTER INSERT ON order_timeline
  FOR EACH ROW
  EXECUTE FUNCTION create_order_audit_log();

-- Trigger: Validate chronological order in timeline
CREATE OR REPLACE FUNCTION validate_timeline_chronological_order()
RETURNS TRIGGER AS $$
DECLARE
  v_previous_occurred_at TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT MAX(occurred_at) INTO v_previous_occurred_at
  FROM order_timeline
  WHERE order_id = NEW.order_id
    AND id != NEW.id;
  
  IF v_previous_occurred_at IS NOT NULL AND NEW.occurred_at < v_previous_occurred_at THEN
    RAISE EXCEPTION 'Timeline entry occurred_at (%) cannot be before previous entry (%)', 
      NEW.occurred_at, v_previous_occurred_at;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_timeline_chronological_trigger ON order_timeline;
CREATE TRIGGER order_timeline_chronological_trigger
  BEFORE INSERT ON order_timeline
  FOR EACH ROW
  EXECUTE FUNCTION validate_timeline_chronological_order();

-- Trigger: Update order_rider_assignments updated_at
CREATE OR REPLACE FUNCTION update_rider_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_rider_assignments_updated_at_trigger ON order_rider_assignments;
CREATE TRIGGER order_rider_assignments_updated_at_trigger
  BEFORE UPDATE ON order_rider_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_rider_assignments_updated_at();

-- Trigger: Update order_payments updated_at
DROP TRIGGER IF EXISTS order_payments_updated_at_trigger ON order_payments;
CREATE TRIGGER order_payments_updated_at_trigger
  BEFORE UPDATE ON order_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update order_tickets updated_at
DROP TRIGGER IF EXISTS order_tickets_updated_at_trigger ON order_tickets;
CREATE TRIGGER order_tickets_updated_at_trigger
  BEFORE UPDATE ON order_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update order_disputes updated_at
DROP TRIGGER IF EXISTS order_disputes_updated_at_trigger ON order_disputes;
CREATE TRIGGER order_disputes_updated_at_trigger
  BEFORE UPDATE ON order_disputes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update service-specific tables updated_at
DROP TRIGGER IF EXISTS order_food_details_updated_at_trigger ON order_food_details;
CREATE TRIGGER order_food_details_updated_at_trigger
  BEFORE UPDATE ON order_food_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS order_parcel_details_updated_at_trigger ON order_parcel_details;
CREATE TRIGGER order_parcel_details_updated_at_trigger
  BEFORE UPDATE ON order_parcel_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS order_ride_details_updated_at_trigger ON order_ride_details;
CREATE TRIGGER order_ride_details_updated_at_trigger
  BEFORE UPDATE ON order_ride_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ORDER STATUS VALIDATION TRIGGERS
-- ============================================================================

-- Trigger: Validate order status transitions
CREATE OR REPLACE FUNCTION validate_order_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'delivered' AND NEW.status != 'delivered' THEN
    RAISE EXCEPTION 'Cannot change status from delivered';
  END IF;
  
  IF OLD.status = 'cancelled' AND NEW.status != 'cancelled' THEN
    RAISE EXCEPTION 'Cannot change status from cancelled';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'status'
  ) THEN
    DROP TRIGGER IF EXISTS orders_status_transition_trigger ON orders;
    CREATE TRIGGER orders_status_transition_trigger
      BEFORE UPDATE OF status ON orders
      FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status)
      EXECUTE FUNCTION validate_order_status_transition();
  END IF;
END $$;

-- ============================================================================
-- RIDER VEHICLE TRIGGERS
-- ============================================================================

-- Trigger: Ensure only one active vehicle per rider
CREATE OR REPLACE FUNCTION ensure_single_active_vehicle()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = TRUE THEN
    UPDATE rider_vehicles
    SET is_active = FALSE
    WHERE rider_id = NEW.rider_id
      AND id != NEW.id
      AND is_active = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rider_vehicles_single_active_trigger ON rider_vehicles;
CREATE TRIGGER rider_vehicles_single_active_trigger
  BEFORE INSERT OR UPDATE ON rider_vehicles
  FOR EACH ROW
  WHEN (NEW.is_active = TRUE)
  EXECUTE FUNCTION ensure_single_active_vehicle();

-- ============================================================================
-- CUSTOMER WALLET TRIGGERS
-- ============================================================================

-- Trigger: Update customer wallet balance on transaction
CREATE OR REPLACE FUNCTION update_customer_wallet_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'customer_wallet'
  ) THEN
    IF NEW.transaction_type = 'CREDIT' THEN
      UPDATE customer_wallet
      SET current_balance = current_balance + NEW.amount,
          available_balance = available_balance + NEW.amount,
          last_transaction_at = NEW.created_at,
          updated_at = NOW()
      WHERE customer_id = NEW.customer_id;
    ELSIF NEW.transaction_type = 'DEBIT' THEN
      UPDATE customer_wallet
      SET current_balance = current_balance - NEW.amount,
          available_balance = available_balance - NEW.amount,
          last_transaction_at = NEW.created_at,
          updated_at = NOW()
      WHERE customer_id = NEW.customer_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customer_wallet_transactions_balance_trigger ON customer_wallet_transactions;
CREATE TRIGGER customer_wallet_transactions_balance_trigger
  AFTER INSERT ON customer_wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_wallet_balance();

-- ============================================================================
-- SYSTEM USER TRIGGERS
-- ============================================================================

-- Trigger: Auto-update system_users updated_at
DROP TRIGGER IF EXISTS system_users_updated_at_trigger ON system_users;
CREATE TRIGGER system_users_updated_at_trigger
  BEFORE UPDATE ON system_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Auto-update system_roles updated_at
DROP TRIGGER IF EXISTS system_roles_updated_at_trigger ON system_roles;
CREATE TRIGGER system_roles_updated_at_trigger
  BEFORE UPDATE ON system_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Auto-update system_permissions updated_at
DROP TRIGGER IF EXISTS system_permissions_updated_at_trigger ON system_permissions;
CREATE TRIGGER system_permissions_updated_at_trigger
  BEFORE UPDATE ON system_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PERMISSION CHANGE LOG TRIGGERS
-- ============================================================================

-- Trigger: Create audit log on permission change
CREATE OR REPLACE FUNCTION create_permission_change_log()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'permission_change_logs'
  ) THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO permission_change_logs (
        target_user_id, target_user_name, change_type,
        role_id, changed_by, created_at
      ) VALUES (
        NEW.system_user_id,
        (SELECT full_name FROM system_users WHERE id = NEW.system_user_id),
        'ROLE_ASSIGNED',
        NEW.role_id,
        NEW.assigned_by,
        NOW()
      );
    ELSIF TG_OP = 'DELETE' THEN
      INSERT INTO permission_change_logs (
        target_user_id, target_user_name, change_type,
        role_id, changed_by, created_at
      ) VALUES (
        OLD.system_user_id,
        (SELECT full_name FROM system_users WHERE id = OLD.system_user_id),
        'ROLE_REVOKED',
        OLD.role_id,
        OLD.assigned_by,
        NOW()
      );
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_roles_change_log_trigger ON user_roles;
CREATE TRIGGER user_roles_change_log_trigger
  AFTER INSERT OR DELETE ON user_roles
  FOR EACH ROW
  EXECUTE FUNCTION create_permission_change_log();

-- ============================================================================
-- RIDE FARE BREAKDOWN VALIDATION
-- ============================================================================

-- Function: Validate ride fare totals
CREATE OR REPLACE FUNCTION validate_ride_fare_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_calculated_total NUMERIC;
BEGIN
  v_calculated_total := 
    NEW.base_fare + 
    COALESCE(NEW.distance_fare, 0) + 
    COALESCE(NEW.time_fare, 0) + 
    COALESCE(NEW.surge_amount, 0) + 
    COALESCE(NEW.toll_charges, 0) + 
    COALESCE(NEW.parking_charges, 0) + 
    COALESCE(NEW.waiting_charges, 0) + 
    COALESCE(NEW.night_charges, 0) + 
    COALESCE(NEW.gst_amount, 0) - 
    COALESCE(NEW.discount_amount, 0);
  
  IF ABS(NEW.total_fare - v_calculated_total) > 0.01 THEN
    RAISE EXCEPTION 'Total fare (%) does not match sum of components (%)', 
      NEW.total_fare, v_calculated_total;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'ride_fare_breakdown'
  ) THEN
    DROP TRIGGER IF EXISTS ride_fare_breakdown_validate_totals_trigger ON ride_fare_breakdown;
    CREATE TRIGGER ride_fare_breakdown_validate_totals_trigger
      BEFORE INSERT OR UPDATE ON ride_fare_breakdown
      FOR EACH ROW
      EXECUTE FUNCTION validate_ride_fare_totals();
  END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION update_updated_at_column() IS 'Utility function to automatically update updated_at timestamp';
COMMENT ON FUNCTION validate_order_status_transition() IS 'Prevents invalid order status transitions';
COMMENT ON FUNCTION ensure_single_active_vehicle() IS 'Ensures only one active vehicle per rider';
