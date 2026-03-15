-- ============================================================================
-- UNIFIED ORDERS RIDER ASSIGNMENTS SYSTEM
-- Production-Grade Multi-Rider Assignment System
-- Supports multiple riders per order with full history
-- Migration: unified_orders_rider_assignments
-- Database: PostgreSQL
-- ORM: Drizzle
-- 
-- DESIGN PRINCIPLES:
-- - Multi-Rider Support: Multiple assignments per order (history preserved)
-- - One Active Assignment: Only one active assignment per order at a time
-- - Immutable History: Assignments never deleted, only new ones added
-- - Rider Snapshot: Rider details snapshotted at assignment time
-- - Provider Support: Supports internal riders and external provider riders
-- ============================================================================

-- ============================================================================
-- ENSURE ENUMS EXIST
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rider_assignment_status') THEN
    CREATE TYPE rider_assignment_status AS ENUM (
      'pending',
      'assigned',
      'accepted',
      'rejected',
      'cancelled',
      'completed',
      'failed'
    );
  END IF;
END $$;

-- ============================================================================
-- ORDER RIDER ASSIGNMENTS (Multi-Rider Support)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_rider_assignments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  rider_id INTEGER NOT NULL REFERENCES public.riders(id) ON DELETE RESTRICT,
  
  -- ==========================================================================
  -- RIDER DETAILS (Snapshot at Assignment Time)
  -- ==========================================================================
  rider_name TEXT,
  rider_mobile TEXT,
  rider_vehicle_type TEXT,
  rider_vehicle_number TEXT,
  
  -- ==========================================================================
  -- DELIVERY PROVIDER INFORMATION
  -- ==========================================================================
  delivery_provider TEXT, -- 'internal', 'swiggy', 'zomato', 'rapido', '3pl', etc.
  provider_rider_id TEXT, -- Provider's rider ID (if external provider)
  provider_assignment_id TEXT, -- Provider's assignment ID
  provider_assignment_status TEXT, -- Provider's assignment status
  
  -- ==========================================================================
  -- ASSIGNMENT DETAILS
  -- ==========================================================================
  assignment_status rider_assignment_status NOT NULL DEFAULT 'pending',
  assignment_method TEXT, -- 'auto', 'manual', 'broadcast', 'rider_request'
  assignment_score NUMERIC(5, 2), -- Algorithm score (for auto-assignment)
  distance_to_pickup_km NUMERIC(6, 2) CHECK (distance_to_pickup_km IS NULL OR distance_to_pickup_km >= 0),
  estimated_arrival_minutes INTEGER,
  
  -- ==========================================================================
  -- TIMESTAMPS (Immutable)
  -- ==========================================================================
  assigned_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  reached_merchant_at TIMESTAMP WITH TIME ZONE,
  picked_up_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  
  -- ==========================================================================
  -- CANCELLATION DETAILS
  -- ==========================================================================
  cancellation_reason TEXT,
  cancellation_reason_code TEXT,
  cancelled_by TEXT, -- 'rider', 'system', 'merchant', 'customer', 'agent'
  cancelled_by_id BIGINT,
  
  -- ==========================================================================
  -- DISTANCE TRACKING
  -- ==========================================================================
  distance_to_merchant_km NUMERIC(6, 2),
  distance_to_customer_km NUMERIC(6, 2),
  total_distance_km NUMERIC(6, 2),
  
  -- ==========================================================================
  -- FINANCIAL INFORMATION
  -- ==========================================================================
  rider_earning NUMERIC(10, 2) CHECK (rider_earning IS NULL OR rider_earning >= 0),
  commission_amount NUMERIC(10, 2),
  tip_amount NUMERIC(10, 2) DEFAULT 0,
  
  -- ==========================================================================
  -- PROVIDER SYNC INFORMATION
  -- ==========================================================================
  synced_to_provider BOOLEAN DEFAULT FALSE,
  provider_sync_error TEXT,
  provider_sync_retry_count INTEGER DEFAULT 0,
  provider_response JSONB DEFAULT '{}',
  provider_metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  assignment_metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for order_rider_assignments
CREATE INDEX IF NOT EXISTS order_rider_assignments_order_id_idx ON public.order_rider_assignments(order_id);
CREATE INDEX IF NOT EXISTS order_rider_assignments_rider_id_idx ON public.order_rider_assignments(rider_id);
CREATE INDEX IF NOT EXISTS order_rider_assignments_assignment_status_idx ON public.order_rider_assignments(assignment_status);
CREATE INDEX IF NOT EXISTS order_rider_assignments_delivery_provider_idx ON public.order_rider_assignments(delivery_provider) WHERE delivery_provider IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_rider_assignments_provider_rider_id_idx ON public.order_rider_assignments(provider_rider_id) WHERE provider_rider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_rider_assignments_created_at_idx ON public.order_rider_assignments(created_at);

-- Composite index for active assignments (most common query)
CREATE INDEX IF NOT EXISTS order_rider_assignments_active_assignment_idx ON public.order_rider_assignments(order_id, assignment_status)
  WHERE assignment_status IN ('pending', 'assigned', 'accepted');

-- Unique constraint: Only one active assignment per order
-- This ensures that only one assignment with status 'pending', 'assigned', or 'accepted' exists per order
CREATE UNIQUE INDEX IF NOT EXISTS order_rider_assignments_active_unique_idx 
  ON public.order_rider_assignments(order_id) 
  WHERE assignment_status IN ('pending', 'assigned', 'accepted');

-- Comments
COMMENT ON TABLE public.order_rider_assignments IS 'Rider assignments for orders. Multiple assignments per order are allowed (history preserved). Only one active assignment per order (status: pending, assigned, or accepted).';
COMMENT ON COLUMN public.order_rider_assignments.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_rider_assignments.rider_id IS 'Foreign key to riders table.';
COMMENT ON COLUMN public.order_rider_assignments.rider_name IS 'Rider name snapshot at assignment time (for historical accuracy).';
COMMENT ON COLUMN public.order_rider_assignments.rider_mobile IS 'Rider mobile snapshot at assignment time (for historical accuracy).';
COMMENT ON COLUMN public.order_rider_assignments.delivery_provider IS 'Delivery provider: internal (our riders), swiggy, zomato, rapido, 3pl, etc.';
COMMENT ON COLUMN public.order_rider_assignments.provider_rider_id IS 'Provider''s rider ID (if external provider).';
COMMENT ON COLUMN public.order_rider_assignments.assignment_status IS 'Status of assignment: pending, assigned, accepted, rejected, cancelled, completed, failed.';
COMMENT ON COLUMN public.order_rider_assignments.assignment_method IS 'Method of assignment: auto (algorithm), manual (agent), broadcast (to multiple riders), rider_request (rider requested).';
COMMENT ON COLUMN public.order_rider_assignments.assignment_score IS 'Algorithm score for auto-assignment (higher is better).';
COMMENT ON COLUMN public.order_rider_assignments.distance_to_pickup_km IS 'Distance from rider location to pickup location in kilometers.';
COMMENT ON COLUMN public.order_rider_assignments.rider_earning IS 'Rider''s earning for this assignment (after commission).';
COMMENT ON COLUMN public.order_rider_assignments.commission_amount IS 'Platform commission deducted from fare.';
COMMENT ON COLUMN public.order_rider_assignments.tip_amount IS 'Tip amount given to rider.';

-- ============================================================================
-- ORDER RIDER DISTANCES (Distance Tracking per Assignment)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_rider_distances (
  id BIGSERIAL PRIMARY KEY,
  rider_assignment_id BIGINT NOT NULL REFERENCES public.order_rider_assignments(id) ON DELETE CASCADE,
  
  -- ==========================================================================
  -- DISTANCE MEASUREMENTS
  -- ==========================================================================
  merchant_to_rider_km NUMERIC(6, 2), -- Distance from merchant to rider location
  merchant_to_customer_km NUMERIC(6, 2), -- Direct distance merchant to customer
  rider_to_merchant_km NUMERIC(6, 2), -- Distance rider traveled to merchant
  rider_to_customer_km NUMERIC(6, 2), -- Distance rider traveled to customer
  total_distance_km NUMERIC(6, 2), -- Total distance traveled
  
  -- ==========================================================================
  -- ROUTE INFORMATION
  -- ==========================================================================
  route_polyline TEXT, -- Encoded polyline string
  route_duration_seconds INTEGER, -- Route duration in seconds
  route_metadata JSONB DEFAULT '{}', -- Additional route metadata
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  
  -- Note: This is an immutable distance record - never updated or deleted
);

-- Indexes for order_rider_distances
CREATE INDEX IF NOT EXISTS order_rider_distances_rider_assignment_id_idx ON public.order_rider_distances(rider_assignment_id);
CREATE INDEX IF NOT EXISTS order_rider_distances_recorded_at_idx ON public.order_rider_distances(recorded_at);

-- Comments
COMMENT ON TABLE public.order_rider_distances IS 'Distance tracking per rider assignment. Immutable record - never updated or deleted. Used for fare calculation and analytics.';
COMMENT ON COLUMN public.order_rider_distances.rider_assignment_id IS 'Foreign key to order_rider_assignments table.';
COMMENT ON COLUMN public.order_rider_distances.merchant_to_rider_km IS 'Distance from merchant location to rider location at assignment time.';
COMMENT ON COLUMN public.order_rider_distances.merchant_to_customer_km IS 'Direct distance from merchant to customer (as the crow flies).';
COMMENT ON COLUMN public.order_rider_distances.rider_to_merchant_km IS 'Actual distance rider traveled to reach merchant.';
COMMENT ON COLUMN public.order_rider_distances.rider_to_customer_km IS 'Actual distance rider traveled from merchant to customer.';
COMMENT ON COLUMN public.order_rider_distances.total_distance_km IS 'Total distance traveled by rider (rider_to_merchant + rider_to_customer).';
COMMENT ON COLUMN public.order_rider_distances.route_polyline IS 'Encoded polyline string for route visualization.';

-- ============================================================================
-- ORDER RIDER ACTIONS (Accept/Reject Actions Log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_rider_actions (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  rider_assignment_id BIGINT REFERENCES public.order_rider_assignments(id) ON DELETE SET NULL,
  rider_id INTEGER NOT NULL REFERENCES public.riders(id) ON DELETE RESTRICT,
  
  -- ==========================================================================
  -- ACTION DETAILS
  -- ==========================================================================
  action TEXT NOT NULL, -- 'accept', 'reject', 'auto_reject', 'timeout'
  reason TEXT,
  reason_code TEXT,
  
  -- ==========================================================================
  -- RESPONSE METRICS
  -- ==========================================================================
  response_time_seconds INTEGER, -- Time taken to respond (in seconds)
  distance_from_pickup_km NUMERIC(6, 2), -- Distance from pickup when action taken
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  action_metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  
  -- Note: This is an immutable action log - never updated or deleted
);

-- Indexes for order_rider_actions
CREATE INDEX IF NOT EXISTS order_rider_actions_order_id_idx ON public.order_rider_actions(order_id);
CREATE INDEX IF NOT EXISTS order_rider_actions_rider_id_idx ON public.order_rider_actions(rider_id);
CREATE INDEX IF NOT EXISTS order_rider_actions_rider_assignment_id_idx ON public.order_rider_actions(rider_assignment_id) WHERE rider_assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_rider_actions_action_idx ON public.order_rider_actions(action);
CREATE INDEX IF NOT EXISTS order_rider_actions_timestamp_idx ON public.order_rider_actions(timestamp);

-- Comments
COMMENT ON TABLE public.order_rider_actions IS 'Rider accept/reject actions log. Immutable record - never updated or deleted. Used for rider performance analytics and assignment algorithm tuning.';
COMMENT ON COLUMN public.order_rider_actions.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_rider_actions.rider_assignment_id IS 'Foreign key to order_rider_assignments table (if action is related to an assignment).';
COMMENT ON COLUMN public.order_rider_actions.rider_id IS 'Foreign key to riders table.';
COMMENT ON COLUMN public.order_rider_actions.action IS 'Action type: accept, reject, auto_reject (system auto-rejected), timeout (rider didn''t respond in time).';
COMMENT ON COLUMN public.order_rider_actions.reason IS 'Reason for action (if reject or auto_reject).';
COMMENT ON COLUMN public.order_rider_actions.response_time_seconds IS 'Time taken by rider to respond (in seconds).';
COMMENT ON COLUMN public.order_rider_actions.distance_from_pickup_km IS 'Distance from pickup location when action was taken.';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Update order_rider_assignments updated_at
CREATE OR REPLACE FUNCTION update_rider_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_rider_assignments_updated_at_trigger ON public.order_rider_assignments;
CREATE TRIGGER order_rider_assignments_updated_at_trigger
  BEFORE UPDATE ON public.order_rider_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update orders.current_rider_id when assignment becomes active
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

DROP TRIGGER IF EXISTS order_rider_assignments_update_current_rider_trigger ON public.order_rider_assignments;
CREATE TRIGGER order_rider_assignments_update_current_rider_trigger
  AFTER INSERT OR UPDATE ON public.order_rider_assignments
  FOR EACH ROW
  WHEN (NEW.assignment_status IN ('pending', 'assigned', 'accepted'))
  EXECUTE FUNCTION update_order_current_rider();

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.order_rider_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_rider_distances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_rider_actions ENABLE ROW LEVEL SECURITY;
