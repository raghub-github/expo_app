-- 3PL (Third-Party Logistics) Integration Tables
-- Migration: 0049_create_3pl_tables
-- Purpose: Support bidirectional 3PL order management (send orders TO 3PL and receive orders FROM 3PL)
-- Supports: food, parcel, and person_ride order types

-- ============================================================================
-- STEP 1: Create 3PL Provider Registry
-- ============================================================================

CREATE TABLE IF NOT EXISTS tpl_providers (
  id BIGSERIAL PRIMARY KEY,
  provider_id TEXT NOT NULL UNIQUE,
  provider_name TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('food', 'parcel', 'person_ride', 'multi')),
  integration_type TEXT NOT NULL CHECK (integration_type IN ('inbound', 'outbound', 'bidirectional')),
  api_base_url TEXT,
  api_key TEXT,
  api_secret TEXT,
  webhook_url TEXT,
  webhook_secret TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'testing')),
  supported_order_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  commission_rate NUMERIC(5, 2),
  service_areas JSONB DEFAULT '{}'::JSONB, -- Geographic coverage areas
  capabilities JSONB DEFAULT '{}'::JSONB, -- Provider capabilities
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tpl_providers IS 'Registry of 3PL providers (third-party logistics partners)';
COMMENT ON COLUMN tpl_providers.provider_type IS 'Type of orders provider handles: food, parcel, person_ride, or multi';
COMMENT ON COLUMN tpl_providers.integration_type IS 'Direction: inbound (receive from), outbound (send to), or bidirectional';
COMMENT ON COLUMN tpl_providers.supported_order_types IS 'Array of order types this provider supports';

-- ============================================================================
-- STEP 2: Create 3PL Provider Capabilities
-- ============================================================================

CREATE TABLE IF NOT EXISTS tpl_provider_capabilities (
  id BIGSERIAL PRIMARY KEY,
  tpl_provider_id BIGINT NOT NULL REFERENCES tpl_providers(id) ON DELETE CASCADE,
  order_type TEXT NOT NULL CHECK (order_type IN ('food', 'parcel', 'person_ride')),
  supported_features TEXT[] DEFAULT ARRAY[]::TEXT[], -- e.g., 'cod', 'scheduled', 'signature_required', 'insurance'
  max_weight_kg NUMERIC(10, 2), -- For parcels
  max_distance_km NUMERIC(10, 2),
  min_distance_km NUMERIC(10, 2) DEFAULT 0,
  service_areas JSONB DEFAULT '{}'::JSONB, -- Geographic areas for this order type
  operating_hours JSONB DEFAULT '{}'::JSONB, -- Time windows for service
  pricing_model TEXT CHECK (pricing_model IN ('fixed', 'distance_based', 'time_based', 'weight_based', 'hybrid')),
  commission_structure JSONB DEFAULT '{}'::JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(tpl_provider_id, order_type)
);

COMMENT ON TABLE tpl_provider_capabilities IS 'Defines capabilities and constraints for each 3PL provider by order type';
COMMENT ON COLUMN tpl_provider_capabilities.supported_features IS 'Array of features: cod, scheduled, signature_required, insurance, etc.';

-- ============================================================================
-- STEP 3: Create Outbound 3PL Order Requests
-- ============================================================================

CREATE TABLE IF NOT EXISTS tpl_order_requests (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  internal_order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tpl_provider_id BIGINT NOT NULL REFERENCES tpl_providers(id),
  order_type TEXT NOT NULL CHECK (order_type IN ('food', 'parcel', 'person_ride')),
  request_status TEXT NOT NULL DEFAULT 'pending' CHECK (request_status IN ('pending', 'sent', 'accepted', 'rejected', 'cancelled', 'expired')),
  request_payload JSONB NOT NULL, -- Full order data sent to 3PL
  tpl_order_id TEXT, -- 3PL's order ID (if accepted)
  tpl_reference TEXT, -- 3PL's reference number
  rejection_reason TEXT,
  rejection_code TEXT,
  accepted_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  response_payload JSONB, -- 3PL's response
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_retry_at TIMESTAMP WITH TIME ZONE,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  error_code TEXT,
  http_status_code INTEGER,
  request_metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tpl_order_requests IS 'Outbound orders sent to 3PL providers for fulfillment';
COMMENT ON COLUMN tpl_order_requests.request_status IS 'Status of the request to 3PL provider';
COMMENT ON COLUMN tpl_order_requests.tpl_order_id IS 'Order ID assigned by 3PL provider after acceptance';

-- ============================================================================
-- STEP 4: Create 3PL Order Status Updates (Outbound)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tpl_order_status_updates (
  id BIGSERIAL PRIMARY KEY,
  tpl_order_request_id BIGINT NOT NULL REFERENCES tpl_order_requests(id) ON DELETE CASCADE,
  internal_order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tpl_provider_id BIGINT NOT NULL REFERENCES tpl_providers(id),
  update_type TEXT NOT NULL CHECK (update_type IN ('status_change', 'rider_assigned', 'rider_enroute', 'picked_up', 'delivered', 'cancelled', 'exception')),
  tpl_status TEXT NOT NULL, -- Status from 3PL provider
  internal_status TEXT, -- Mapped internal status
  update_payload JSONB NOT NULL, -- Full update from 3PL
  rider_info JSONB, -- 3PL rider details if assigned: {id, name, phone, vehicle}
  location_info JSONB, -- Location updates: {lat, lon, address, timestamp}
  estimated_delivery_time TIMESTAMP WITH TIME ZONE,
  actual_delivery_time TIMESTAMP WITH TIME ZONE,
  exception_details JSONB, -- Exception information if any
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tpl_order_status_updates IS 'Status updates received from 3PL providers for outbound orders';
COMMENT ON COLUMN tpl_order_status_updates.update_type IS 'Type of update received from 3PL provider';

-- ============================================================================
-- STEP 5: Create Inbound 3PL Orders
-- ============================================================================

CREATE TABLE IF NOT EXISTS tpl_inbound_orders (
  id BIGSERIAL PRIMARY KEY,
  tpl_order_id TEXT NOT NULL, -- 3PL's order ID
  tpl_provider_id BIGINT NOT NULL REFERENCES tpl_providers(id),
  internal_order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL, -- Created internal order
  order_type TEXT NOT NULL CHECK (order_type IN ('food', 'parcel', 'person_ride')),
  order_status TEXT NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'accepted', 'rejected', 'processing', 'assigned', 'picked_up', 'in_transit', 'delivered', 'completed', 'cancelled')),
  order_payload JSONB NOT NULL, -- Full order data from 3PL
  acceptance_status TEXT DEFAULT 'pending' CHECK (acceptance_status IN ('pending', 'accepted', 'rejected', 'auto_accepted')),
  rejection_reason TEXT,
  rejection_code TEXT,
  accepted_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  accepted_by BIGINT REFERENCES system_users(id), -- Agent who accepted
  assigned_rider_id INTEGER REFERENCES riders(id),
  tpl_rider_id TEXT, -- 3PL's rider ID (if they assign)
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed', 'conflict')),
  sync_error TEXT,
  sync_retry_count INTEGER DEFAULT 0,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(tpl_provider_id, tpl_order_id)
);

COMMENT ON TABLE tpl_inbound_orders IS 'Orders received from 3PL providers for our fulfillment';
COMMENT ON COLUMN tpl_inbound_orders.tpl_order_id IS 'Order ID from 3PL provider';
COMMENT ON COLUMN tpl_inbound_orders.internal_order_id IS 'Internal order created from this 3PL order';

-- ============================================================================
-- STEP 6: Create 3PL Order Sync Log
-- ============================================================================

CREATE TABLE IF NOT EXISTS tpl_order_sync_log (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  tpl_provider_id BIGINT NOT NULL REFERENCES tpl_providers(id),
  tpl_order_request_id BIGINT REFERENCES tpl_order_requests(id) ON DELETE SET NULL,
  tpl_inbound_order_id BIGINT REFERENCES tpl_inbound_orders(id) ON DELETE SET NULL,
  sync_direction TEXT NOT NULL CHECK (sync_direction IN ('outbound', 'inbound')),
  sync_type TEXT NOT NULL CHECK (sync_type IN ('order_create', 'order_update', 'status_update', 'rider_assignment', 'cancellation', 'webhook', 'api_call')),
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'success', 'failed', 'retrying', 'cancelled')),
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  error_code TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  http_status_code INTEGER,
  response_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE tpl_order_sync_log IS 'Comprehensive sync log for all 3PL operations (both inbound and outbound)';
COMMENT ON COLUMN tpl_order_sync_log.sync_direction IS 'Direction: outbound (we send) or inbound (we receive)';
COMMENT ON COLUMN tpl_order_sync_log.sync_type IS 'Type of sync operation';

-- ============================================================================
-- STEP 7: Add 3PL Columns to Orders Table
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tpl_provider_id BIGINT REFERENCES tpl_providers(id),
  ADD COLUMN IF NOT EXISTS tpl_order_request_id BIGINT REFERENCES tpl_order_requests(id),
  ADD COLUMN IF NOT EXISTS tpl_inbound_order_id BIGINT REFERENCES tpl_inbound_orders(id),
  ADD COLUMN IF NOT EXISTS is_tpl_order BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tpl_direction TEXT CHECK (tpl_direction IN ('outbound', 'inbound', NULL));

COMMENT ON COLUMN orders.tpl_provider_id IS '3PL provider ID if this order is handled by 3PL';
COMMENT ON COLUMN orders.tpl_order_request_id IS 'Reference to outbound 3PL request if we sent order to 3PL';
COMMENT ON COLUMN orders.tpl_inbound_order_id IS 'Reference to inbound 3PL order if we received from 3PL';
COMMENT ON COLUMN orders.is_tpl_order IS 'Flag indicating if this order involves 3PL';
COMMENT ON COLUMN orders.tpl_direction IS 'Direction: outbound (we sent to 3PL) or inbound (we received from 3PL)';

-- ============================================================================
-- STEP 8: Create Indexes for Performance
-- ============================================================================

-- tpl_providers indexes
CREATE INDEX IF NOT EXISTS idx_tpl_providers_status ON tpl_providers(status);
CREATE INDEX IF NOT EXISTS idx_tpl_providers_type ON tpl_providers(provider_type);
CREATE INDEX IF NOT EXISTS idx_tpl_providers_integration_type ON tpl_providers(integration_type);

-- tpl_provider_capabilities indexes
CREATE INDEX IF NOT EXISTS idx_tpl_provider_capabilities_provider ON tpl_provider_capabilities(tpl_provider_id);
CREATE INDEX IF NOT EXISTS idx_tpl_provider_capabilities_order_type ON tpl_provider_capabilities(order_type);
CREATE INDEX IF NOT EXISTS idx_tpl_provider_capabilities_active ON tpl_provider_capabilities(tpl_provider_id, order_type, is_active) WHERE is_active = TRUE;

-- tpl_order_requests indexes
CREATE INDEX IF NOT EXISTS idx_tpl_order_requests_internal_order ON tpl_order_requests(internal_order_id);
CREATE INDEX IF NOT EXISTS idx_tpl_order_requests_provider ON tpl_order_requests(tpl_provider_id);
CREATE INDEX IF NOT EXISTS idx_tpl_order_requests_status ON tpl_order_requests(request_status);
CREATE INDEX IF NOT EXISTS idx_tpl_order_requests_provider_status ON tpl_order_requests(tpl_provider_id, request_status);
CREATE INDEX IF NOT EXISTS idx_tpl_order_requests_tpl_order_id ON tpl_order_requests(tpl_order_id) WHERE tpl_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tpl_order_requests_created_at ON tpl_order_requests(created_at);

-- tpl_order_status_updates indexes
CREATE INDEX IF NOT EXISTS idx_tpl_order_status_updates_request ON tpl_order_status_updates(tpl_order_request_id);
CREATE INDEX IF NOT EXISTS idx_tpl_order_status_updates_internal_order ON tpl_order_status_updates(internal_order_id);
CREATE INDEX IF NOT EXISTS idx_tpl_order_status_updates_provider ON tpl_order_status_updates(tpl_provider_id);
CREATE INDEX IF NOT EXISTS idx_tpl_order_status_updates_processed ON tpl_order_status_updates(processed, created_at) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_tpl_order_status_updates_type ON tpl_order_status_updates(update_type);

-- tpl_inbound_orders indexes
CREATE INDEX IF NOT EXISTS idx_tpl_inbound_orders_provider_order ON tpl_inbound_orders(tpl_provider_id, tpl_order_id);
CREATE INDEX IF NOT EXISTS idx_tpl_inbound_orders_internal_order ON tpl_inbound_orders(internal_order_id) WHERE internal_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tpl_inbound_orders_status ON tpl_inbound_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_tpl_inbound_orders_acceptance ON tpl_inbound_orders(acceptance_status);
CREATE INDEX IF NOT EXISTS idx_tpl_inbound_orders_rider ON tpl_inbound_orders(assigned_rider_id) WHERE assigned_rider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tpl_inbound_orders_sync_status ON tpl_inbound_orders(sync_status);
CREATE INDEX IF NOT EXISTS idx_tpl_inbound_orders_created_at ON tpl_inbound_orders(created_at);

-- tpl_order_sync_log indexes
CREATE INDEX IF NOT EXISTS idx_tpl_order_sync_log_order ON tpl_order_sync_log(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tpl_order_sync_log_provider ON tpl_order_sync_log(tpl_provider_id);
CREATE INDEX IF NOT EXISTS idx_tpl_order_sync_log_direction ON tpl_order_sync_log(sync_direction);
CREATE INDEX IF NOT EXISTS idx_tpl_order_sync_log_status ON tpl_order_sync_log(sync_status);
CREATE INDEX IF NOT EXISTS idx_tpl_order_sync_log_provider_status ON tpl_order_sync_log(tpl_provider_id, sync_status, created_at);
CREATE INDEX IF NOT EXISTS idx_tpl_order_sync_log_request ON tpl_order_sync_log(tpl_order_request_id) WHERE tpl_order_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tpl_order_sync_log_inbound ON tpl_order_sync_log(tpl_inbound_order_id) WHERE tpl_inbound_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tpl_order_sync_log_created_at ON tpl_order_sync_log(created_at);

-- orders table 3PL indexes
CREATE INDEX IF NOT EXISTS idx_orders_tpl_provider ON orders(tpl_provider_id) WHERE tpl_provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_tpl_request ON orders(tpl_order_request_id) WHERE tpl_order_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_tpl_inbound ON orders(tpl_inbound_order_id) WHERE tpl_inbound_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_is_tpl ON orders(is_tpl_order) WHERE is_tpl_order = TRUE;
CREATE INDEX IF NOT EXISTS idx_orders_tpl_direction ON orders(tpl_direction) WHERE tpl_direction IS NOT NULL;

-- ============================================================================
-- STEP 9: Add Comments for Documentation
-- ============================================================================

COMMENT ON TABLE tpl_providers IS 'Registry of 3PL (Third-Party Logistics) providers for order fulfillment';
COMMENT ON TABLE tpl_provider_capabilities IS 'Capabilities and constraints for each 3PL provider by order type';
COMMENT ON TABLE tpl_order_requests IS 'Outbound orders sent to 3PL providers for fulfillment';
COMMENT ON TABLE tpl_order_status_updates IS 'Status updates received from 3PL providers for outbound orders';
COMMENT ON TABLE tpl_inbound_orders IS 'Orders received from 3PL providers for our fulfillment';
COMMENT ON TABLE tpl_order_sync_log IS 'Comprehensive sync log for all 3PL operations';

-- ============================================================================
-- STEP 10: Create Helper Functions (Optional)
-- ============================================================================

-- Function to get active 3PL providers for an order type
CREATE OR REPLACE FUNCTION get_active_tpl_providers(p_order_type TEXT)
RETURNS TABLE (
  provider_id BIGINT,
  provider_name TEXT,
  provider_type TEXT,
  integration_type TEXT,
  capabilities JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tp.id,
    tp.provider_name,
    tp.provider_type,
    tp.integration_type,
    tpc.capabilities
  FROM tpl_providers tp
  LEFT JOIN tpl_provider_capabilities tpc ON tp.id = tpc.tpl_provider_id AND tpc.order_type = p_order_type
  WHERE tp.status = 'active'
    AND (tp.provider_type = 'multi' OR tp.provider_type = p_order_type)
    AND (tp.integration_type = 'outbound' OR tp.integration_type = 'bidirectional')
    AND (tpc.is_active IS NULL OR tpc.is_active = TRUE);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_active_tpl_providers IS 'Returns active 3PL providers that can handle the specified order type';
