-- ============================================================================
-- EXTERNAL PROVIDER ORDER ENHANCEMENTS
-- Ensures complete support for orders from external providers (Swiggy, Zomato, Rapido, ONDC, Shiprocket)
-- Migration: 0009_external_provider_order_enhancements
-- Database: Supabase PostgreSQL
-- 
-- This migration enhances the unified order schema to fully support:
-- - External provider orders with proper rider assignment tracking
-- - Provider-specific order data preservation
-- - Bidirectional synchronization
-- - Provider rider mapping
-- ============================================================================

-- ============================================================================
-- ENHANCE ORDERS TABLE FOR EXTERNAL PROVIDERS
-- ============================================================================

-- Add provider-specific tracking fields (if not already added in 0008)
ALTER TABLE orders
  -- Provider Order Mapping
  ADD COLUMN IF NOT EXISTS provider_order_id TEXT, -- External provider's order ID
  ADD COLUMN IF NOT EXISTS provider_reference TEXT, -- Provider's reference number
  ADD COLUMN IF NOT EXISTS provider_order_number TEXT, -- Human-readable order number
  
  -- Provider Integration Status
  ADD COLUMN IF NOT EXISTS synced_with_provider BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending', -- 'synced', 'pending', 'failed', 'conflict'
  ADD COLUMN IF NOT EXISTS sync_error TEXT,
  ADD COLUMN IF NOT EXISTS sync_retry_count INTEGER DEFAULT 0,
  
  -- Provider Status (may differ from internal status)
  ADD COLUMN IF NOT EXISTS provider_status TEXT, -- Provider's status
  ADD COLUMN IF NOT EXISTS provider_status_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- Provider Financial Data
  ADD COLUMN IF NOT EXISTS provider_fare_amount NUMERIC(12, 2), -- Original fare from provider
  ADD COLUMN IF NOT EXISTS provider_commission NUMERIC(12, 2), -- Commission from provider
  ADD COLUMN IF NOT EXISTS provider_rider_payout NUMERIC(12, 2), -- What provider pays rider
  
  -- Provider Metadata (preserve all provider data)
  ADD COLUMN IF NOT EXISTS provider_metadata JSONB DEFAULT '{}', -- Complete provider payload
  ADD COLUMN IF NOT EXISTS provider_webhook_data JSONB DEFAULT '{}', -- Original webhook data
  
  -- Provider Timestamps
  ADD COLUMN IF NOT EXISTS provider_created_at TIMESTAMP WITH TIME ZONE, -- When provider created order
  ADD COLUMN IF NOT EXISTS provider_updated_at TIMESTAMP WITH TIME ZONE, -- Last update from provider
  
  -- Provider Customer/Merchant IDs
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_merchant_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_restaurant_id TEXT, -- For food orders
  
  -- Provider-Specific Fields (Swiggy, Zomato, Rapido)
  ADD COLUMN IF NOT EXISTS swiggy_order_id TEXT,
  ADD COLUMN IF NOT EXISTS swiggy_delivery_partner_id TEXT,
  ADD COLUMN IF NOT EXISTS zomato_order_id TEXT,
  ADD COLUMN IF NOT EXISTS zomato_delivery_partner_id TEXT,
  ADD COLUMN IF NOT EXISTS rapido_booking_id TEXT,
  ADD COLUMN IF NOT EXISTS rapido_trip_id TEXT,
  ADD COLUMN IF NOT EXISTS ondc_order_id TEXT,
  ADD COLUMN IF NOT EXISTS shiprocket_shipment_id TEXT,
  
  -- Order Creation Source
  ADD COLUMN IF NOT EXISTS created_via TEXT DEFAULT 'app', -- 'app', 'webhook', 'api', 'admin', 'provider'
  ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER, -- If created by admin/user
  ADD COLUMN IF NOT EXISTS webhook_event_id BIGINT, -- Reference to webhook_events table
  
  -- Assignment Source
  ADD COLUMN IF NOT EXISTS assigned_via TEXT DEFAULT 'auto', -- 'auto', 'manual', 'provider', 'broadcast', 'rider_request'
  ADD COLUMN IF NOT EXISTS assignment_provider TEXT; -- Which provider assigned the rider

-- Create indexes for provider queries
CREATE INDEX IF NOT EXISTS orders_provider_order_id_idx ON orders(provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_provider_reference_idx ON orders(provider_reference) WHERE provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_order_source_idx ON orders(order_source);
CREATE INDEX IF NOT EXISTS orders_synced_with_provider_idx ON orders(synced_with_provider);
CREATE INDEX IF NOT EXISTS orders_sync_status_idx ON orders(sync_status) WHERE sync_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_provider_status_idx ON orders(provider_status) WHERE provider_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_order_source_provider_order_id_idx ON orders(order_source, provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_swiggy_order_id_idx ON orders(swiggy_order_id) WHERE swiggy_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_zomato_order_id_idx ON orders(zomato_order_id) WHERE zomato_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_rapido_booking_id_idx ON orders(rapido_booking_id) WHERE rapido_booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_ondc_order_id_idx ON orders(ondc_order_id) WHERE ondc_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_webhook_event_id_idx ON orders(webhook_event_id) WHERE webhook_event_id IS NOT NULL;

-- ============================================================================
-- PROVIDER ORDER MAPPING TABLE (Enhanced)
-- ============================================================================

-- This table maps internal orders to provider orders (bidirectional)
CREATE TABLE IF NOT EXISTS provider_order_mapping (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider_type order_source_type NOT NULL,
  
  -- Provider Order IDs
  provider_order_id TEXT NOT NULL,
  provider_reference TEXT,
  provider_order_number TEXT,
  
  -- Provider Status
  provider_status TEXT,
  provider_status_code TEXT, -- Provider's status code
  provider_status_message TEXT,
  
  -- Provider Financial Data
  provider_fare_amount NUMERIC(12, 2),
  provider_commission NUMERIC(12, 2),
  provider_rider_payout NUMERIC(12, 2),
  provider_customer_paid NUMERIC(12, 2),
  
  -- Sync Status
  synced_at TIMESTAMP WITH TIME ZONE,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  sync_status TEXT DEFAULT 'pending', -- 'synced', 'pending', 'failed', 'conflict'
  sync_error TEXT,
  sync_retry_count INTEGER DEFAULT 0,
  
  -- Provider Metadata
  provider_metadata JSONB DEFAULT '{}',
  provider_webhook_data JSONB DEFAULT '{}',
  
  -- Provider Timestamps
  provider_created_at TIMESTAMP WITH TIME ZONE,
  provider_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- Provider Customer/Merchant IDs
  provider_customer_id TEXT,
  provider_merchant_id TEXT,
  provider_restaurant_id TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(provider_type, provider_order_id)
);

CREATE INDEX IF NOT EXISTS provider_order_mapping_order_id_idx ON provider_order_mapping(order_id);
CREATE INDEX IF NOT EXISTS provider_order_mapping_provider_type_idx ON provider_order_mapping(provider_type);
CREATE INDEX IF NOT EXISTS provider_order_mapping_provider_order_id_idx ON provider_order_mapping(provider_order_id);
CREATE INDEX IF NOT EXISTS provider_order_mapping_sync_status_idx ON provider_order_mapping(sync_status);
CREATE INDEX IF NOT EXISTS provider_order_mapping_order_provider_idx ON provider_order_mapping(order_id, provider_type);

-- ============================================================================
-- PROVIDER RIDER MAPPING (Map Provider Riders to Internal Riders)
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_rider_mapping (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  provider_type order_source_type NOT NULL,
  
  -- Provider Rider IDs
  provider_rider_id TEXT NOT NULL, -- Provider's rider ID
  provider_rider_name TEXT,
  provider_rider_phone TEXT,
  provider_rider_email TEXT,
  
  -- Provider Vehicle Info
  provider_vehicle_type TEXT,
  provider_vehicle_number TEXT,
  provider_vehicle_model TEXT,
  
  -- Provider Status
  provider_rider_status TEXT, -- 'active', 'inactive', 'suspended'
  is_verified BOOLEAN DEFAULT FALSE,
  verification_date TIMESTAMP WITH TIME ZONE,
  
  -- Provider Metadata
  provider_metadata JSONB DEFAULT '{}',
  
  -- Sync Status
  synced_at TIMESTAMP WITH TIME ZONE,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  sync_status TEXT DEFAULT 'pending',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(rider_id, provider_type, provider_rider_id)
);

CREATE INDEX IF NOT EXISTS provider_rider_mapping_rider_id_idx ON provider_rider_mapping(rider_id);
CREATE INDEX IF NOT EXISTS provider_rider_mapping_provider_type_idx ON provider_rider_mapping(provider_type);
CREATE INDEX IF NOT EXISTS provider_rider_mapping_provider_rider_id_idx ON provider_rider_mapping(provider_rider_id);
CREATE INDEX IF NOT EXISTS provider_rider_mapping_rider_provider_idx ON provider_rider_mapping(rider_id, provider_type);

-- ============================================================================
-- ENHANCE ORDER_RIDER_ASSIGNMENTS FOR PROVIDER SUPPORT
-- ============================================================================

ALTER TABLE order_rider_assignments
  -- Provider Assignment Details
  ADD COLUMN IF NOT EXISTS provider_assignment_id TEXT, -- Provider's assignment ID
  ADD COLUMN IF NOT EXISTS provider_rider_id TEXT, -- Provider's rider ID (if different from internal)
  ADD COLUMN IF NOT EXISTS provider_assignment_status TEXT, -- Provider's assignment status
  
  -- Provider Sync Status
  ADD COLUMN IF NOT EXISTS synced_to_provider BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS provider_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS provider_sync_retry_count INTEGER DEFAULT 0,
  
  -- Provider Response
  ADD COLUMN IF NOT EXISTS provider_response JSONB DEFAULT '{}', -- Provider's response to assignment
  ADD COLUMN IF NOT EXISTS provider_metadata JSONB DEFAULT '{}';

-- Create indexes
CREATE INDEX IF NOT EXISTS order_rider_assignments_provider_assignment_id_idx 
  ON order_rider_assignments(provider_assignment_id) WHERE provider_assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_rider_assignments_provider_rider_id_idx 
  ON order_rider_assignments(provider_rider_id) WHERE provider_rider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_rider_assignments_synced_to_provider_idx 
  ON order_rider_assignments(synced_to_provider);

-- ============================================================================
-- PROVIDER ORDER STATUS SYNC LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_order_status_sync (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider_type order_source_type NOT NULL,
  
  -- Sync Direction
  sync_direction TEXT NOT NULL, -- 'inbound' (from provider), 'outbound' (to provider)
  sync_type TEXT NOT NULL, -- 'status_update', 'rider_assignment', 'payment_update', 'cancellation'
  
  -- Status Details
  internal_status order_status_type,
  provider_status TEXT,
  previous_internal_status order_status_type,
  previous_provider_status TEXT,
  
  -- Rider Assignment Sync
  rider_assignment_id BIGINT REFERENCES order_rider_assignments(id) ON DELETE SET NULL,
  provider_rider_id TEXT,
  
  -- Sync Result
  success BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  error_code TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Request/Response
  request_payload JSONB DEFAULT '{}',
  response_payload JSONB DEFAULT '{}',
  response_status_code INTEGER,
  
  -- Metadata
  sync_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS provider_order_status_sync_order_id_idx ON provider_order_status_sync(order_id);
CREATE INDEX IF NOT EXISTS provider_order_status_sync_provider_type_idx ON provider_order_status_sync(provider_type);
CREATE INDEX IF NOT EXISTS provider_order_status_sync_sync_direction_idx ON provider_order_status_sync(sync_direction);
CREATE INDEX IF NOT EXISTS provider_order_status_sync_success_idx ON provider_order_status_sync(success);
CREATE INDEX IF NOT EXISTS provider_order_status_sync_created_at_idx ON provider_order_status_sync(created_at);

-- ============================================================================
-- PROVIDER ORDER WEBHOOK EVENTS (Link to existing webhook_events)
-- ============================================================================

-- Add order_id reference to existing webhook_events table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhook_events' AND column_name = 'order_id'
  ) THEN
    ALTER TABLE webhook_events
      ADD COLUMN order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL;
    
    CREATE INDEX webhook_events_order_id_idx ON webhook_events(order_id) WHERE order_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- PROVIDER ORDER PAYMENT MAPPING
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_order_payment_mapping (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_payment_id BIGINT REFERENCES order_payments(id) ON DELETE SET NULL,
  provider_type order_source_type NOT NULL,
  
  -- Provider Payment IDs
  provider_payment_id TEXT NOT NULL,
  provider_transaction_id TEXT,
  provider_payment_status TEXT,
  
  -- Provider Payment Details
  provider_payment_amount NUMERIC(12, 2),
  provider_payment_method TEXT,
  provider_payment_gateway TEXT,
  
  -- Sync Status
  synced_at TIMESTAMP WITH TIME ZONE,
  sync_status TEXT DEFAULT 'pending',
  sync_error TEXT,
  
  -- Provider Metadata
  provider_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(provider_type, provider_payment_id)
);

CREATE INDEX IF NOT EXISTS provider_order_payment_mapping_order_id_idx ON provider_order_payment_mapping(order_id);
CREATE INDEX IF NOT EXISTS provider_order_payment_mapping_order_payment_id_idx ON provider_order_payment_mapping(order_payment_id) WHERE order_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS provider_order_payment_mapping_provider_type_idx ON provider_order_payment_mapping(provider_type);
CREATE INDEX IF NOT EXISTS provider_order_payment_mapping_provider_payment_id_idx ON provider_order_payment_mapping(provider_payment_id);

-- ============================================================================
-- PROVIDER ORDER REFUND MAPPING
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_order_refund_mapping (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_refund_id BIGINT REFERENCES order_refunds(id) ON DELETE SET NULL,
  provider_type order_source_type NOT NULL,
  
  -- Provider Refund IDs
  provider_refund_id TEXT NOT NULL,
  provider_refund_transaction_id TEXT,
  provider_refund_status TEXT,
  
  -- Provider Refund Details
  provider_refund_amount NUMERIC(12, 2),
  provider_refund_reason TEXT,
  
  -- Sync Status
  synced_at TIMESTAMP WITH TIME ZONE,
  sync_status TEXT DEFAULT 'pending',
  sync_error TEXT,
  
  -- Provider Metadata
  provider_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(provider_type, provider_refund_id)
);

CREATE INDEX IF NOT EXISTS provider_order_refund_mapping_order_id_idx ON provider_order_refund_mapping(order_id);
CREATE INDEX IF NOT EXISTS provider_order_refund_mapping_order_refund_id_idx ON provider_order_refund_mapping(order_refund_id) WHERE order_refund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS provider_order_refund_mapping_provider_type_idx ON provider_order_refund_mapping(provider_type);
CREATE INDEX IF NOT EXISTS provider_order_refund_mapping_provider_refund_id_idx ON provider_order_refund_mapping(provider_refund_id);

-- ============================================================================
-- PROVIDER ORDER ITEM MAPPING (For external provider items)
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_order_item_mapping (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id BIGINT REFERENCES order_items(id) ON DELETE SET NULL,
  provider_type order_source_type NOT NULL,
  
  -- Provider Item IDs
  provider_item_id TEXT NOT NULL,
  provider_menu_id TEXT,
  provider_item_name TEXT,
  
  -- Provider Item Details
  provider_item_price NUMERIC(10, 2),
  provider_item_quantity INTEGER,
  provider_item_total NUMERIC(10, 2),
  
  -- Provider Metadata
  provider_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(provider_type, provider_item_id, order_id)
);

CREATE INDEX IF NOT EXISTS provider_order_item_mapping_order_id_idx ON provider_order_item_mapping(order_id);
CREATE INDEX IF NOT EXISTS provider_order_item_mapping_order_item_id_idx ON provider_order_item_mapping(order_item_id) WHERE order_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS provider_order_item_mapping_provider_type_idx ON provider_order_item_mapping(provider_type);
CREATE INDEX IF NOT EXISTS provider_order_item_mapping_provider_item_id_idx ON provider_order_item_mapping(provider_item_id);

-- ============================================================================
-- ENHANCE ORDER_TIMELINE FOR PROVIDER SYNC
-- ============================================================================

ALTER TABLE order_timeline
  ADD COLUMN IF NOT EXISTS synced_to_provider BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS provider_status TEXT, -- Provider's equivalent status
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT, -- Provider's event ID if synced
  ADD COLUMN IF NOT EXISTS provider_sync_error TEXT;

CREATE INDEX IF NOT EXISTS order_timeline_synced_to_provider_idx ON order_timeline(synced_to_provider);
CREATE INDEX IF NOT EXISTS order_timeline_provider_event_id_idx ON order_timeline(provider_event_id) WHERE provider_event_id IS NOT NULL;

-- ============================================================================
-- PROVIDER ORDER CONFLICTS (Status/Data Mismatches)
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_order_conflicts (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider_type order_source_type NOT NULL,
  
  -- Conflict Details
  conflict_type TEXT NOT NULL, -- 'status_mismatch', 'fare_mismatch', 'rider_mismatch', 'payment_mismatch', 'item_mismatch'
  conflict_field TEXT, -- Which field has conflict
  internal_value JSONB NOT NULL, -- Our current value
  provider_value JSONB NOT NULL, -- Provider's value
  
  -- Resolution
  resolution_strategy TEXT DEFAULT 'manual_review', -- 'ours_wins', 'theirs_wins', 'manual_review', 'merge'
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by INTEGER, -- Admin user ID
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  resolution_action TEXT, -- What action was taken
  
  -- Metadata
  conflict_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS provider_order_conflicts_order_id_idx ON provider_order_conflicts(order_id);
CREATE INDEX IF NOT EXISTS provider_order_conflicts_provider_type_idx ON provider_order_conflicts(provider_type);
CREATE INDEX IF NOT EXISTS provider_order_conflicts_resolved_idx ON provider_order_conflicts(resolved) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS provider_order_conflicts_conflict_type_idx ON provider_order_conflicts(conflict_type);

-- ============================================================================
-- PROVIDER ORDER ANALYTICS (For reporting)
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_order_analytics (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider_type order_source_type NOT NULL,
  
  -- Performance Metrics
  time_to_assign_seconds INTEGER, -- Time from order creation to rider assignment
  time_to_accept_seconds INTEGER, -- Time from assignment to acceptance
  time_to_pickup_seconds INTEGER, -- Time from acceptance to pickup
  time_to_delivery_seconds INTEGER, -- Time from pickup to delivery
  total_duration_seconds INTEGER, -- Total order duration
  
  -- Distance Metrics
  estimated_distance_km NUMERIC(6, 2),
  actual_distance_km NUMERIC(6, 2),
  distance_variance NUMERIC(6, 2), -- Difference between estimated and actual
  
  -- Financial Metrics
  provider_commission_rate NUMERIC(5, 2), -- Commission percentage
  rider_earning_rate NUMERIC(5, 2), -- Rider earning percentage
  platform_margin NUMERIC(12, 2), -- Platform margin
  
  -- Quality Metrics
  customer_rating NUMERIC(3, 2),
  rider_rating NUMERIC(3, 2),
  cancellation_reason TEXT,
  
  -- Provider Comparison
  provider_estimated_time_minutes INTEGER,
  actual_time_minutes INTEGER,
  time_variance_minutes INTEGER,
  
  -- Metadata
  analytics_metadata JSONB DEFAULT '{}',
  calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS provider_order_analytics_order_id_idx ON provider_order_analytics(order_id);
CREATE INDEX IF NOT EXISTS provider_order_analytics_provider_type_idx ON provider_order_analytics(provider_type);
CREATE INDEX IF NOT EXISTS provider_order_analytics_calculated_at_idx ON provider_order_analytics(calculated_at);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Update provider_order_mapping updated_at
DROP TRIGGER IF EXISTS provider_order_mapping_updated_at_trigger ON provider_order_mapping;
CREATE TRIGGER provider_order_mapping_updated_at_trigger
  BEFORE UPDATE ON provider_order_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update provider_rider_mapping updated_at
DROP TRIGGER IF EXISTS provider_rider_mapping_updated_at_trigger ON provider_rider_mapping;
CREATE TRIGGER provider_rider_mapping_updated_at_trigger
  BEFORE UPDATE ON provider_rider_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update provider_order_payment_mapping updated_at
DROP TRIGGER IF EXISTS provider_order_payment_mapping_updated_at_trigger ON provider_order_payment_mapping;
CREATE TRIGGER provider_order_payment_mapping_updated_at_trigger
  BEFORE UPDATE ON provider_order_payment_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update provider_order_refund_mapping updated_at
DROP TRIGGER IF EXISTS provider_order_refund_mapping_updated_at_trigger ON provider_order_refund_mapping;
CREATE TRIGGER provider_order_refund_mapping_updated_at_trigger
  BEFORE UPDATE ON provider_order_refund_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update provider_order_item_mapping updated_at
DROP TRIGGER IF EXISTS provider_order_item_mapping_updated_at_trigger ON provider_order_item_mapping;
CREATE TRIGGER provider_order_item_mapping_updated_at_trigger
  BEFORE UPDATE ON provider_order_item_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update provider_order_conflicts updated_at
DROP TRIGGER IF EXISTS provider_order_conflicts_updated_at_trigger ON provider_order_conflicts;
CREATE TRIGGER provider_order_conflicts_updated_at_trigger
  BEFORE UPDATE ON provider_order_conflicts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE provider_order_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_rider_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_order_status_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_order_payment_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_order_refund_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_order_item_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_order_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_order_analytics ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE provider_order_mapping IS 'Maps internal orders to external provider orders. Enables bidirectional synchronization.';
COMMENT ON TABLE provider_rider_mapping IS 'Maps internal riders to external provider riders. Tracks provider-specific rider data.';
COMMENT ON TABLE provider_order_status_sync IS 'Logs all status synchronization attempts between internal and provider systems.';
COMMENT ON TABLE provider_order_payment_mapping IS 'Maps internal payments to provider payments. Tracks payment synchronization.';
COMMENT ON TABLE provider_order_refund_mapping IS 'Maps internal refunds to provider refunds. Tracks refund synchronization.';
COMMENT ON TABLE provider_order_item_mapping IS 'Maps internal order items to provider items. Preserves provider item data.';
COMMENT ON TABLE provider_order_conflicts IS 'Tracks conflicts between internal and provider order data. Flags for manual resolution.';
COMMENT ON TABLE provider_order_analytics IS 'Analytics and performance metrics for provider orders. Used for reporting and optimization.';

COMMENT ON COLUMN orders.provider_order_id IS 'External provider''s order ID. Used for synchronization and tracking.';
COMMENT ON COLUMN orders.synced_with_provider IS 'Whether order data is synchronized with external provider.';
COMMENT ON COLUMN orders.provider_metadata IS 'Complete provider payload preserved for audit and reference.';
COMMENT ON COLUMN order_rider_assignments.provider_assignment_id IS 'Provider''s assignment ID. Used for tracking provider-specific assignments.';
COMMENT ON COLUMN order_rider_assignments.provider_rider_id IS 'Provider''s rider ID if different from internal rider_id.';

-- ============================================================================
-- ADD MISSING FOREIGN KEYS
-- ============================================================================

-- Orders -> Webhook Events (if webhook_events table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'webhook_events') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'orders' 
        AND column_name = 'webhook_event_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_webhook_event_id_fkey'
      ) THEN
        ALTER TABLE orders
          ADD CONSTRAINT orders_webhook_event_id_fkey
          FOREIGN KEY (webhook_event_id) REFERENCES webhook_events(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- Provider Order Conflicts -> System Users (if system_users table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_users') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'provider_order_conflicts' 
        AND column_name = 'resolved_by'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'provider_order_conflicts_resolved_by_fkey'
      ) THEN
        ALTER TABLE provider_order_conflicts
          ADD CONSTRAINT provider_order_conflicts_resolved_by_fkey
          FOREIGN KEY (resolved_by) REFERENCES system_users(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;
