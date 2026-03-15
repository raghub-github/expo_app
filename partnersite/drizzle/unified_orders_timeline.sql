-- ============================================================================
-- UNIFIED ORDERS TIMELINE AND AUDIT TRAIL
-- Production-Grade Immutable History System
-- Complete audit trail of all order changes
-- Migration: unified_orders_timeline
-- Database: PostgreSQL
-- ORM: Drizzle
-- 
-- DESIGN PRINCIPLES:
-- - Immutable History: Timeline and audit logs never update, only insert
-- - Complete Audit Trail: Every action logged with actor information
-- - Chronological Order: Timeline entries in chronological order
-- - Legal Dispute Safe: Complete snapshots and timelines for compliance
-- ============================================================================

-- ============================================================================
-- ENSURE ENUMS EXIST
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status_type') THEN
    CREATE TYPE order_status_type AS ENUM (
      'assigned',
      'accepted',
      'reached_store',
      'picked_up',
      'in_transit',
      'delivered',
      'cancelled',
      'failed'
    );
  END IF;
END $$;

-- ============================================================================
-- ORDER TIMELINE (Immutable Status History)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_timeline (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- ==========================================================================
  -- STATUS TRANSITION
  -- ==========================================================================
  status order_status_type NOT NULL,
  previous_status order_status_type,
  
  -- ==========================================================================
  -- ACTOR INFORMATION
  -- ==========================================================================
  actor_type TEXT NOT NULL, -- 'customer', 'rider', 'merchant', 'system', 'agent'
  actor_id BIGINT,
  actor_name TEXT,
  
  -- ==========================================================================
  -- LOCATION (Where Status Changed)
  -- ==========================================================================
  location_lat DOUBLE PRECISION,
  location_lon DOUBLE PRECISION,
  location_address TEXT,
  
  -- ==========================================================================
  -- ADDITIONAL DETAILS
  -- ==========================================================================
  status_message TEXT,
  status_metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- PROVIDER SYNC TRACKING
  -- ==========================================================================
  synced_to_provider BOOLEAN DEFAULT FALSE,
  provider_status TEXT, -- Provider's status (may differ from ours)
  provider_event_id TEXT, -- Provider's event ID
  provider_sync_error TEXT, -- Sync error if failed
  
  -- ==========================================================================
  -- TIMESTAMP (Immutable)
  -- ==========================================================================
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  
  -- Note: Timeline entries are NEVER updated or deleted - only inserted
);

-- Indexes for order_timeline
CREATE INDEX IF NOT EXISTS order_timeline_order_id_idx ON public.order_timeline(order_id);
CREATE INDEX IF NOT EXISTS order_timeline_status_idx ON public.order_timeline(status);
CREATE INDEX IF NOT EXISTS order_timeline_previous_status_idx ON public.order_timeline(previous_status) WHERE previous_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_timeline_actor_type_idx ON public.order_timeline(actor_type);
CREATE INDEX IF NOT EXISTS order_timeline_actor_id_idx ON public.order_timeline(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_timeline_occurred_at_idx ON public.order_timeline(occurred_at);
CREATE INDEX IF NOT EXISTS order_timeline_order_occurred_idx ON public.order_timeline(order_id, occurred_at);
CREATE INDEX IF NOT EXISTS order_timeline_synced_to_provider_idx ON public.order_timeline(synced_to_provider) WHERE synced_to_provider = FALSE;

-- Comments
COMMENT ON TABLE public.order_timeline IS 'Immutable chronological history of all order status changes. Never updated or deleted - only inserted. Complete audit trail for legal compliance.';
COMMENT ON COLUMN public.order_timeline.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_timeline.status IS 'Current status at this point in time.';
COMMENT ON COLUMN public.order_timeline.previous_status IS 'Previous status before this change.';
COMMENT ON COLUMN public.order_timeline.actor_type IS 'Type of actor who made the change: customer, rider, merchant, system, agent.';
COMMENT ON COLUMN public.order_timeline.actor_id IS 'ID of the actor who made the change.';
COMMENT ON COLUMN public.order_timeline.actor_name IS 'Name of the actor who made the change (snapshot at time of change).';
COMMENT ON COLUMN public.order_timeline.location_lat IS 'Latitude where status change occurred.';
COMMENT ON COLUMN public.order_timeline.location_lon IS 'Longitude where status change occurred.';
COMMENT ON COLUMN public.order_timeline.location_address IS 'Address where status change occurred.';
COMMENT ON COLUMN public.order_timeline.status_message IS 'Message or description of the status change.';
COMMENT ON COLUMN public.order_timeline.occurred_at IS 'Immutable timestamp when status change occurred. Timeline entries are never updated or deleted.';
COMMENT ON COLUMN public.order_timeline.synced_to_provider IS 'Whether this status change was synced to external provider.';

-- ============================================================================
-- ORDER AUDIT LOG (Complete Audit Trail of All Changes)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_audit_log (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- ==========================================================================
  -- ACTION DETAILS
  -- ==========================================================================
  action_type TEXT NOT NULL, -- 'create', 'update', 'delete', 'status_change', 'payment', 'refund', 'rider_assigned', etc.
  action_field TEXT, -- Field name if specific field changed
  old_value JSONB, -- Old value (before change)
  new_value JSONB, -- New value (after change)
  
  -- ==========================================================================
  -- ACTOR INFORMATION
  -- ==========================================================================
  actor_type TEXT NOT NULL, -- 'customer', 'rider', 'merchant', 'agent', 'system'
  actor_id BIGINT,
  actor_name TEXT,
  actor_ip TEXT,
  actor_user_agent TEXT,
  
  -- ==========================================================================
  -- ADDITIONAL CONTEXT
  -- ==========================================================================
  action_reason TEXT, -- Reason for action
  action_metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- TIMESTAMP
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  
  -- Note: Audit log entries are NEVER updated or deleted - only inserted
);

-- Indexes for order_audit_log
CREATE INDEX IF NOT EXISTS order_audit_log_order_id_idx ON public.order_audit_log(order_id);
CREATE INDEX IF NOT EXISTS order_audit_log_action_type_idx ON public.order_audit_log(action_type);
CREATE INDEX IF NOT EXISTS order_audit_log_action_field_idx ON public.order_audit_log(action_field) WHERE action_field IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_audit_log_actor_type_idx ON public.order_audit_log(actor_type);
CREATE INDEX IF NOT EXISTS order_audit_log_actor_id_idx ON public.order_audit_log(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_audit_log_created_at_idx ON public.order_audit_log(created_at);
CREATE INDEX IF NOT EXISTS order_audit_log_order_created_idx ON public.order_audit_log(order_id, created_at);

-- Comments
COMMENT ON TABLE public.order_audit_log IS 'Complete audit trail of all order changes (not just status changes). Tracks who changed what and when. Legal dispute safe. Never updated or deleted.';
COMMENT ON COLUMN public.order_audit_log.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_audit_log.action_type IS 'Type of action: create, update, delete, status_change, payment, refund, rider_assigned, etc.';
COMMENT ON COLUMN public.order_audit_log.action_field IS 'Field name if specific field changed (e.g., "status", "payment_status", "rider_id").';
COMMENT ON COLUMN public.order_audit_log.old_value IS 'Old value before change (stored as JSONB for flexibility).';
COMMENT ON COLUMN public.order_audit_log.new_value IS 'New value after change (stored as JSONB for flexibility).';
COMMENT ON COLUMN public.order_audit_log.actor_type IS 'Type of actor who made the change: customer, rider, merchant, agent, system.';
COMMENT ON COLUMN public.order_audit_log.actor_id IS 'ID of the actor who made the change.';
COMMENT ON COLUMN public.order_audit_log.actor_name IS 'Name of the actor who made the change (snapshot at time of change).';
COMMENT ON COLUMN public.order_audit_log.actor_ip IS 'IP address of the actor who made the change.';
COMMENT ON COLUMN public.order_audit_log.actor_user_agent IS 'User agent of the actor who made the change.';
COMMENT ON COLUMN public.order_audit_log.action_reason IS 'Reason for the action (if provided).';
COMMENT ON COLUMN public.order_audit_log.created_at IS 'Timestamp when action occurred. Audit log entries are never updated or deleted.';

-- ============================================================================
-- ORDER STATUS HISTORY (Legacy Support - May be Deprecated)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- ==========================================================================
  -- STATUS TRANSITION
  -- ==========================================================================
  from_status order_status_type,
  to_status order_status_type NOT NULL,
  
  -- ==========================================================================
  -- CHANGE DETAILS
  -- ==========================================================================
  changed_by TEXT NOT NULL, -- 'rider', 'customer', 'merchant', 'system', 'admin'
  changed_by_id INTEGER,
  reason TEXT,
  
  -- ==========================================================================
  -- LOCATION
  -- ==========================================================================
  location_lat DOUBLE PRECISION,
  location_lon DOUBLE PRECISION,
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- PROVIDER SYNC
  -- ==========================================================================
  synced_to_provider BOOLEAN DEFAULT FALSE,
  provider_status TEXT,
  
  -- ==========================================================================
  -- TIMESTAMP
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  
  -- Note: This table may be deprecated in favor of order_timeline
);

-- Indexes for order_status_history
CREATE INDEX IF NOT EXISTS order_status_history_order_id_idx ON public.order_status_history(order_id);
CREATE INDEX IF NOT EXISTS order_status_history_from_status_idx ON public.order_status_history(from_status) WHERE from_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_status_history_to_status_idx ON public.order_status_history(to_status);
CREATE INDEX IF NOT EXISTS order_status_history_changed_by_idx ON public.order_status_history(changed_by);
CREATE INDEX IF NOT EXISTS order_status_history_created_at_idx ON public.order_status_history(created_at);
CREATE INDEX IF NOT EXISTS order_status_history_order_created_idx ON public.order_status_history(order_id, created_at);

-- Comments
COMMENT ON TABLE public.order_status_history IS 'Legacy status history table. May be deprecated in favor of order_timeline. Immutable history - never updated or deleted.';
COMMENT ON COLUMN public.order_status_history.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_status_history.from_status IS 'Previous status before change.';
COMMENT ON COLUMN public.order_status_history.to_status IS 'New status after change.';
COMMENT ON COLUMN public.order_status_history.changed_by IS 'Who changed the status: rider, customer, merchant, system, admin.';
COMMENT ON COLUMN public.order_status_history.changed_by_id IS 'ID of who changed the status.';
COMMENT ON COLUMN public.order_status_history.reason IS 'Reason for status change.';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Auto-create timeline entry when order status changes
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

DROP TRIGGER IF EXISTS orders_status_change_trigger ON public.orders;
CREATE TRIGGER orders_status_change_trigger
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION sync_order_status_to_timeline();

-- Trigger: Update orders.current_status from timeline
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

DROP TRIGGER IF EXISTS orders_timeline_sync_trigger ON public.order_timeline;
CREATE TRIGGER orders_timeline_sync_trigger
  AFTER INSERT ON public.order_timeline
  FOR EACH ROW
  EXECUTE FUNCTION update_order_current_status();

-- Trigger: Validate chronological order in timeline
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

DROP TRIGGER IF EXISTS order_timeline_chronological_trigger ON public.order_timeline;
CREATE TRIGGER order_timeline_chronological_trigger
  BEFORE INSERT ON public.order_timeline
  FOR EACH ROW
  EXECUTE FUNCTION validate_timeline_chronological_order();

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.order_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
