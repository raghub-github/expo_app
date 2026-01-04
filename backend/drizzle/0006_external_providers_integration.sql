-- External Provider Integration & Multi-Source Order Management
-- Supports orders from internal app + external providers (Swiggy, Zomato, Rapido)
-- Migration: 0006_external_providers_integration
-- Database: Supabase PostgreSQL

-- ============================================================================
-- EXTERNAL PROVIDERS & INTEGRATIONS
-- ============================================================================

-- Provider Types Enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provider_type') THEN
    CREATE TYPE provider_type AS ENUM (
      'internal', -- Orders from our own app
      'swiggy',
      'zomato',
      'rapido',
      'uber',
      'dunzo',
      'other'
    );
  END IF;
END $$;

-- Integration Status Enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'integration_status') THEN
    CREATE TYPE integration_status AS ENUM (
      'active',
      'inactive',
      'suspended',
      'testing'
    );
  END IF;
END $$;

-- Webhook Event Status
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'webhook_event_status') THEN
    CREATE TYPE webhook_event_status AS ENUM (
      'pending',
      'processing',
      'processed',
      'failed',
      'ignored'
    );
  END IF;
END $$;

-- ============================================================================
-- PROVIDER CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_configs (
  id BIGSERIAL PRIMARY KEY,
  provider_type provider_type NOT NULL,
  provider_name TEXT NOT NULL, -- Display name
  api_base_url TEXT,
  api_key TEXT, -- Encrypted
  api_secret TEXT, -- Encrypted
  webhook_secret TEXT, -- For webhook signature verification
  webhook_url TEXT, -- Our webhook endpoint URL
  auth_token TEXT, -- Encrypted OAuth token or API token
  refresh_token TEXT, -- Encrypted refresh token
  token_expires_at TIMESTAMP WITH TIME ZONE,
  status integration_status NOT NULL DEFAULT 'active',
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_hour INTEGER DEFAULT 1000,
  metadata JSONB DEFAULT '{}', -- Provider-specific config
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(provider_type)
);

CREATE INDEX IF NOT EXISTS provider_configs_provider_type_idx ON provider_configs(provider_type);
CREATE INDEX IF NOT EXISTS provider_configs_status_idx ON provider_configs(status);

-- ============================================================================
-- ENHANCE ORDERS TABLE FOR MULTI-SOURCE SUPPORT
-- ============================================================================

ALTER TABLE orders
  -- Source tracking
  ADD COLUMN IF NOT EXISTS source provider_type NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS provider_order_id TEXT, -- External provider's order ID
  ADD COLUMN IF NOT EXISTS provider_reference TEXT, -- Provider's reference number
  
  -- Integration tracking
  ADD COLUMN IF NOT EXISTS synced_with_provider BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS sync_status TEXT, -- 'synced', 'pending', 'failed', 'conflict'
  ADD COLUMN IF NOT EXISTS sync_error TEXT,
  
  -- Provider-specific metadata
  ADD COLUMN IF NOT EXISTS provider_metadata JSONB DEFAULT '{}', -- Provider-specific data
  ADD COLUMN IF NOT EXISTS provider_fare_amount NUMERIC(10, 2), -- Original fare from provider
  ADD COLUMN IF NOT EXISTS provider_commission NUMERIC(10, 2), -- Commission from provider
  
  -- Order source details
  ADD COLUMN IF NOT EXISTS created_via TEXT DEFAULT 'app', -- 'app', 'webhook', 'api', 'admin'
  ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER, -- If created by admin/user
  ADD COLUMN IF NOT EXISTS assigned_via TEXT DEFAULT 'auto', -- 'auto', 'manual', 'provider', 'broadcast'
  
  -- External provider status mapping
  ADD COLUMN IF NOT EXISTS provider_status TEXT, -- Provider's status (may differ from ours)
  ADD COLUMN IF NOT EXISTS provider_status_updated_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for provider queries
CREATE INDEX IF NOT EXISTS orders_source_idx ON orders(source);
CREATE INDEX IF NOT EXISTS orders_provider_order_id_idx ON orders(provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_provider_reference_idx ON orders(provider_reference) WHERE provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_synced_with_provider_idx ON orders(synced_with_provider);
CREATE INDEX IF NOT EXISTS orders_sync_status_idx ON orders(sync_status) WHERE sync_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_source_provider_order_id_idx ON orders(source, provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_provider_status_idx ON orders(provider_status) WHERE provider_status IS NOT NULL;

-- ============================================================================
-- WEBHOOK EVENTS (From External Providers)
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,
  provider_type provider_type NOT NULL,
  event_type TEXT NOT NULL, -- 'order.created', 'order.updated', 'order.cancelled', 'payment.completed', etc.
  event_id TEXT, -- Provider's event ID
  payload JSONB NOT NULL, -- Full webhook payload
  signature TEXT, -- Provider signature for verification
  signature_verified BOOLEAN DEFAULT FALSE,
  status webhook_event_status NOT NULL DEFAULT 'pending',
  processing_attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  error_stack TEXT,
  processed_order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL, -- If order was created/updated
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_events_provider_type_idx ON webhook_events(provider_type);
CREATE INDEX IF NOT EXISTS webhook_events_event_type_idx ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS webhook_events_status_idx ON webhook_events(status);
CREATE INDEX IF NOT EXISTS webhook_events_event_id_idx ON webhook_events(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS webhook_events_processed_order_id_idx ON webhook_events(processed_order_id) WHERE processed_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS webhook_events_created_at_idx ON webhook_events(created_at);
CREATE INDEX IF NOT EXISTS webhook_events_pending_processing_idx ON webhook_events(status, created_at) WHERE status IN ('pending', 'processing');

-- ============================================================================
-- PROVIDER ORDER MAPPING (Internal Order ID <-> Provider Order ID)
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_order_mapping (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider_type provider_type NOT NULL,
  provider_order_id TEXT NOT NULL,
  provider_reference TEXT,
  provider_status TEXT, -- Provider's status
  provider_fare_amount NUMERIC(10, 2),
  provider_commission NUMERIC(10, 2),
  synced_at TIMESTAMP WITH TIME ZONE,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  sync_status TEXT DEFAULT 'pending', -- 'synced', 'pending', 'failed', 'conflict'
  sync_error TEXT,
  metadata JSONB DEFAULT '{}',
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
-- API CALL LOGS (For External Provider API Calls)
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_call_logs (
  id BIGSERIAL PRIMARY KEY,
  provider_type provider_type NOT NULL,
  endpoint TEXT NOT NULL, -- API endpoint called
  method TEXT NOT NULL, -- 'GET', 'POST', 'PUT', 'DELETE'
  request_payload JSONB,
  response_status_code INTEGER,
  response_body JSONB,
  response_time_ms INTEGER,
  success BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_call_logs_provider_type_idx ON api_call_logs(provider_type);
CREATE INDEX IF NOT EXISTS api_call_logs_endpoint_idx ON api_call_logs(endpoint);
CREATE INDEX IF NOT EXISTS api_call_logs_success_idx ON api_call_logs(success);
CREATE INDEX IF NOT EXISTS api_call_logs_order_id_idx ON api_call_logs(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS api_call_logs_created_at_idx ON api_call_logs(created_at);

-- ============================================================================
-- ORDER SYNCHRONIZATION LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_sync_logs (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider_type provider_type NOT NULL,
  sync_direction TEXT NOT NULL, -- 'inbound' (from provider), 'outbound' (to provider)
  sync_type TEXT NOT NULL, -- 'create', 'update', 'status_update', 'cancel'
  old_status order_status_type,
  new_status order_status_type,
  old_data JSONB, -- Snapshot before sync
  new_data JSONB, -- Snapshot after sync
  success BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_sync_logs_order_id_idx ON order_sync_logs(order_id);
CREATE INDEX IF NOT EXISTS order_sync_logs_provider_type_idx ON order_sync_logs(provider_type);
CREATE INDEX IF NOT EXISTS order_sync_logs_sync_direction_idx ON order_sync_logs(sync_direction);
CREATE INDEX IF NOT EXISTS order_sync_logs_success_idx ON order_sync_logs(success);
CREATE INDEX IF NOT EXISTS order_sync_logs_created_at_idx ON order_sync_logs(created_at);

-- ============================================================================
-- ENHANCE EXISTING TABLES FOR PROVIDER SUPPORT
-- ============================================================================

-- Add provider tracking to order_events
ALTER TABLE order_events
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT, -- Provider's event ID if synced
  ADD COLUMN IF NOT EXISTS synced_to_provider BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS provider_sync_error TEXT;

CREATE INDEX IF NOT EXISTS order_events_provider_event_id_idx ON order_events(provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_events_synced_to_provider_idx ON order_events(synced_to_provider);

-- Add provider tracking to order_actions
ALTER TABLE order_actions
  ADD COLUMN IF NOT EXISTS synced_to_provider BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS provider_response JSONB;

CREATE INDEX IF NOT EXISTS order_actions_synced_to_provider_idx ON order_actions(synced_to_provider);

-- Add provider tracking to order_status_history
ALTER TABLE order_status_history
  ADD COLUMN IF NOT EXISTS synced_to_provider BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS provider_status TEXT; -- Provider's equivalent status

CREATE INDEX IF NOT EXISTS order_status_history_synced_to_provider_idx ON order_status_history(synced_to_provider);

-- ============================================================================
-- PROVIDER-SPECIFIC ORDER FIELDS
-- ============================================================================

-- Swiggy-specific fields
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS swiggy_order_id TEXT,
  ADD COLUMN IF NOT EXISTS swiggy_restaurant_id TEXT,
  ADD COLUMN IF NOT EXISTS swiggy_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS swiggy_delivery_partner_id TEXT;

-- Zomato-specific fields
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS zomato_order_id TEXT,
  ADD COLUMN IF NOT EXISTS zomato_restaurant_id TEXT,
  ADD COLUMN IF NOT EXISTS zomato_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS zomato_delivery_partner_id TEXT;

-- Rapido-specific fields
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS rapido_booking_id TEXT,
  ADD COLUMN IF NOT EXISTS rapido_rider_id TEXT,
  ADD COLUMN IF NOT EXISTS rapido_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS rapido_trip_id TEXT;

-- Create indexes for provider-specific IDs
CREATE INDEX IF NOT EXISTS orders_swiggy_order_id_idx ON orders(swiggy_order_id) WHERE swiggy_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_zomato_order_id_idx ON orders(zomato_order_id) WHERE zomato_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_rapido_booking_id_idx ON orders(rapido_booking_id) WHERE rapido_booking_id IS NOT NULL;

-- ============================================================================
-- PROVIDER RATE LIMITING
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_rate_limits (
  id BIGSERIAL PRIMARY KEY,
  provider_type provider_type NOT NULL,
  endpoint TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  window_end TIMESTAMP WITH TIME ZONE NOT NULL,
  limit_exceeded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(provider_type, endpoint, window_start)
);

CREATE INDEX IF NOT EXISTS provider_rate_limits_provider_endpoint_idx ON provider_rate_limits(provider_type, endpoint);
CREATE INDEX IF NOT EXISTS provider_rate_limits_window_end_idx ON provider_rate_limits(window_end);

-- ============================================================================
-- PROVIDER WEBHOOK CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_configurations (
  id BIGSERIAL PRIMARY KEY,
  provider_type provider_type NOT NULL,
  event_type TEXT NOT NULL, -- 'order.created', 'order.updated', etc.
  webhook_url TEXT NOT NULL, -- Our endpoint URL
  secret_key TEXT NOT NULL, -- For signature verification
  enabled BOOLEAN DEFAULT TRUE,
  retry_on_failure BOOLEAN DEFAULT TRUE,
  max_retries INTEGER DEFAULT 3,
  timeout_seconds INTEGER DEFAULT 30,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(provider_type, event_type)
);

CREATE INDEX IF NOT EXISTS webhook_configurations_provider_type_idx ON webhook_configurations(provider_type);
CREATE INDEX IF NOT EXISTS webhook_configurations_enabled_idx ON webhook_configurations(enabled);

-- ============================================================================
-- ORDER CONFLICT RESOLUTION
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conflict_resolution_strategy') THEN
    CREATE TYPE conflict_resolution_strategy AS ENUM (
      'ours_wins', -- Our internal status takes precedence
      'theirs_wins', -- Provider status takes precedence
      'manual_review', -- Flag for manual review
      'merge' -- Merge both statuses
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS order_conflicts (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider_type provider_type NOT NULL,
  conflict_type TEXT NOT NULL, -- 'status_mismatch', 'fare_mismatch', 'rider_mismatch', etc.
  our_value JSONB NOT NULL, -- Our current value
  provider_value JSONB NOT NULL, -- Provider's value
  resolution_strategy conflict_resolution_strategy DEFAULT 'manual_review',
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by INTEGER, -- Admin user ID
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_conflicts_order_id_idx ON order_conflicts(order_id);
CREATE INDEX IF NOT EXISTS order_conflicts_provider_type_idx ON order_conflicts(provider_type);
CREATE INDEX IF NOT EXISTS order_conflicts_resolved_idx ON order_conflicts(resolved) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS order_conflicts_conflict_type_idx ON order_conflicts(conflict_type);

-- ============================================================================
-- PROVIDER COMMISSION STRUCTURE
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_commission_rules (
  id BIGSERIAL PRIMARY KEY,
  provider_type provider_type NOT NULL,
  order_type order_type NOT NULL,
  commission_type TEXT NOT NULL, -- 'percentage', 'fixed', 'tiered'
  commission_value NUMERIC(10, 2) NOT NULL, -- Percentage or fixed amount
  min_order_value NUMERIC(10, 2), -- Minimum order value for this rule
  max_order_value NUMERIC(10, 2), -- Maximum order value for this rule
  city TEXT, -- NULL means global
  effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
  effective_to TIMESTAMP WITH TIME ZONE, -- NULL means currently active
  created_by INTEGER, -- Admin user ID
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS provider_commission_rules_provider_type_idx ON provider_commission_rules(provider_type);
CREATE INDEX IF NOT EXISTS provider_commission_rules_order_type_idx ON provider_commission_rules(order_type);
CREATE INDEX IF NOT EXISTS provider_commission_rules_city_idx ON provider_commission_rules(city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS provider_commission_rules_active_idx ON provider_commission_rules(effective_from, effective_to) WHERE effective_to IS NULL;

-- Partial unique index (with WHERE clause)
CREATE UNIQUE INDEX IF NOT EXISTS provider_commission_rules_active_unique_idx 
  ON provider_commission_rules(provider_type, order_type, effective_from) 
  WHERE effective_to IS NULL;

-- ============================================================================
-- ENHANCE MERCHANT/CUSTOMER TABLES (If they exist, or create references)
-- ============================================================================

-- Note: If you have separate merchant/customer tables, add provider references there
-- For now, we'll add provider IDs to orders table (already done above)

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger for provider_configs updated_at
DROP TRIGGER IF EXISTS update_provider_configs_updated_at ON provider_configs;
CREATE TRIGGER update_provider_configs_updated_at
  BEFORE UPDATE ON provider_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for provider_order_mapping updated_at
DROP TRIGGER IF EXISTS update_provider_order_mapping_updated_at ON provider_order_mapping;
CREATE TRIGGER update_provider_order_mapping_updated_at
  BEFORE UPDATE ON provider_order_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for webhook_configurations updated_at
DROP TRIGGER IF EXISTS update_webhook_configurations_updated_at ON webhook_configurations;
CREATE TRIGGER update_webhook_configurations_updated_at
  BEFORE UPDATE ON webhook_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for provider_rate_limits updated_at
DROP TRIGGER IF EXISTS update_provider_rate_limits_updated_at ON provider_rate_limits;
CREATE TRIGGER update_provider_rate_limits_updated_at
  BEFORE UPDATE ON provider_rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNCTIONS FOR PROVIDER OPERATIONS
-- ============================================================================

-- Function to get active provider config
CREATE OR REPLACE FUNCTION get_provider_config(p_provider provider_type)
RETURNS TABLE (
  id BIGINT,
  provider_type provider_type,
  api_base_url TEXT,
  status integration_status,
  metadata JSONB
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if order exists from provider
CREATE OR REPLACE FUNCTION order_exists_from_provider(
  p_provider provider_type,
  p_provider_order_id TEXT
)
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_order_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_commission_rules ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE provider_configs IS 'Configuration for external provider integrations (Swiggy, Zomato, Rapido). Stores API credentials and settings.';
COMMENT ON TABLE webhook_events IS 'Incoming webhook events from external providers. Tracks processing status and errors.';
COMMENT ON TABLE provider_order_mapping IS 'Maps internal order IDs to provider order IDs. Enables bidirectional synchronization.';
COMMENT ON TABLE api_call_logs IS 'Logs all API calls made to external providers. Useful for debugging and monitoring.';
COMMENT ON TABLE order_sync_logs IS 'Tracks synchronization attempts between internal and provider systems.';
COMMENT ON TABLE provider_rate_limits IS 'Rate limiting tracking for external provider API calls. Prevents exceeding API limits.';
COMMENT ON TABLE webhook_configurations IS 'Configuration for webhook endpoints. Defines which events to accept and how to process them.';
COMMENT ON TABLE order_conflicts IS 'Tracks conflicts between internal and provider order data. Flags for manual resolution.';
COMMENT ON TABLE provider_commission_rules IS 'Commission structure for each provider. Supports different rates per order type and city.';

COMMENT ON COLUMN orders.source IS 'Order source: internal (our app) or external provider (swiggy, zomato, rapido)';
COMMENT ON COLUMN orders.provider_order_id IS 'External provider''s order ID. Used for synchronization.';
COMMENT ON COLUMN orders.synced_with_provider IS 'Whether order data is synchronized with external provider';
COMMENT ON COLUMN orders.provider_metadata IS 'Provider-specific data that doesn''t fit in standard fields';
COMMENT ON COLUMN orders.created_via IS 'How order was created: app, webhook, api, or admin';
