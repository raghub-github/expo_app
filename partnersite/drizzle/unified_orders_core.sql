-- ============================================================================
-- UNIFIED ORDERS CORE TABLE
-- Production-Grade Unified Order System
-- Consolidates orders and orders_core into single source of truth
-- Migration: unified_orders_core
-- Database: PostgreSQL
-- ORM: Drizzle
-- 
-- DESIGN PRINCIPLES:
-- - Single Source of Truth: One unified orders table
-- - Order ID: BIGSERIAL starting at 1000000 (6+ digits)
-- - Supports: Food, Parcel, Ride, 3PL orders
-- - Provider Agnostic: Internal app, Swiggy, Zomato, Rapido, ONDC, Shiprocket
-- - Multi-Rider Support: current_rider_id denormalized for quick access
-- - Full Audit Trail: All changes tracked via order_timeline and order_audit_log
-- ============================================================================

-- ============================================================================
-- ENSURE ENUMS EXIST (Create if not exists)
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_type') THEN
    CREATE TYPE order_type AS ENUM (
      'food',
      'parcel',
      'ride',
      '3pl'
    );
  END IF;
END $$;

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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_source_type') THEN
    CREATE TYPE order_source_type AS ENUM (
      'internal',
      'swiggy',
      'zomato',
      'rapido',
      'ondc',
      'shiprocket',
      'other'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_category_type') THEN
    CREATE TYPE order_category_type AS ENUM (
      'food',
      'parcel',
      'ride',
      '3pl'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_type') THEN
    CREATE TYPE payment_status_type AS ENUM (
      'pending',
      'processing',
      'completed',
      'failed',
      'refunded',
      'partially_refunded',
      'cancelled'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_mode_type') THEN
    CREATE TYPE payment_mode_type AS ENUM (
      'cash',
      'online',
      'wallet',
      'upi',
      'card',
      'netbanking',
      'cod',
      'other'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_type') THEN
    CREATE TYPE delivery_type AS ENUM (
      'standard',
      'express',
      'scheduled',
      'same_day',
      'next_day'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_initiator_type') THEN
    CREATE TYPE delivery_initiator_type AS ENUM (
      'customer',
      'merchant',
      'system',
      'agent'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'locality_type') THEN
    CREATE TYPE locality_type AS ENUM (
      'urban',
      'semi_urban',
      'rural',
      'highway'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'veg_non_veg_type') THEN
    CREATE TYPE veg_non_veg_type AS ENUM (
      'veg',
      'non_veg',
      'mixed',
      'na'
    );
  END IF;
END $$;

-- ============================================================================
-- CREATE UNIFIED ORDERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.orders (
  -- ==========================================================================
  -- ORDER IDENTITY
  -- ==========================================================================
  id BIGSERIAL PRIMARY KEY,
  order_uuid UUID UNIQUE DEFAULT gen_random_uuid(),
  formatted_order_id TEXT UNIQUE,
  external_ref TEXT,
  
  -- ==========================================================================
  -- SERVICE CLASSIFICATION
  -- ==========================================================================
  order_type order_type NOT NULL,
  order_category order_category_type,
  order_source order_source_type NOT NULL DEFAULT 'internal',
  
  -- ==========================================================================
  -- PARTY REFERENCES
  -- ==========================================================================
  customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL,
  merchant_store_id BIGINT REFERENCES public.merchant_stores(id) ON DELETE SET NULL,
  merchant_parent_id BIGINT REFERENCES public.merchant_parents(id) ON DELETE SET NULL,
  current_rider_id INTEGER REFERENCES public.riders(id) ON DELETE SET NULL, -- Denormalized for quick access
  
  -- ==========================================================================
  -- LOCATION INFORMATION
  -- ==========================================================================
  -- Pickup Address (Raw, Normalized, Geocoded)
  pickup_address_raw TEXT NOT NULL,
  pickup_address_normalized TEXT,
  pickup_address_geocoded TEXT,
  pickup_lat NUMERIC(10, 7) NOT NULL CHECK (pickup_lat >= -90 AND pickup_lat <= 90),
  pickup_lon NUMERIC(10, 7) NOT NULL CHECK (pickup_lon >= -180 AND pickup_lon <= 180),
  pickup_address_deviation_meters NUMERIC(6, 2),
  
  -- Drop/Delivery Address (Raw, Normalized, Geocoded)
  drop_address_raw TEXT NOT NULL,
  drop_address_normalized TEXT,
  drop_address_geocoded TEXT,
  drop_lat NUMERIC(10, 7) NOT NULL CHECK (drop_lat >= -90 AND drop_lat <= 90),
  drop_lon NUMERIC(10, 7) NOT NULL CHECK (drop_lon >= -180 AND drop_lon <= 180),
  drop_address_deviation_meters NUMERIC(6, 2),
  
  -- Distance & Routing
  distance_km NUMERIC(8, 2),
  distance_mismatch_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  eta_seconds INTEGER,
  
  -- ==========================================================================
  -- FINANCIAL INFORMATION
  -- ==========================================================================
  fare_amount NUMERIC(12, 2),
  commission_amount NUMERIC(12, 2),
  rider_earning NUMERIC(12, 2),
  
  -- Totals (Snapshot at order creation)
  total_item_value NUMERIC(12, 2) DEFAULT 0 CHECK (total_item_value >= 0),
  total_tax NUMERIC(12, 2) DEFAULT 0,
  total_discount NUMERIC(12, 2) DEFAULT 0,
  total_delivery_fee NUMERIC(12, 2) DEFAULT 0,
  total_ctm NUMERIC(12, 2) DEFAULT 0, -- Commission to merchant
  total_payable NUMERIC(12, 2) DEFAULT 0 CHECK (total_payable >= 0),
  total_paid NUMERIC(12, 2) DEFAULT 0,
  total_refunded NUMERIC(12, 2) DEFAULT 0,
  
  -- Tip
  has_tip BOOLEAN DEFAULT FALSE,
  tip_amount NUMERIC(10, 2) DEFAULT 0 CHECK (tip_amount >= 0),
  
  -- ==========================================================================
  -- ORDER STATUS
  -- ==========================================================================
  status order_status_type NOT NULL DEFAULT 'assigned',
  current_status TEXT, -- Denormalized status (synced from order_timeline)
  payment_status payment_status_type DEFAULT 'pending',
  payment_method payment_mode_type,
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Estimated Times
  estimated_pickup_time TIMESTAMP WITH TIME ZONE,
  estimated_delivery_time TIMESTAMP WITH TIME ZONE,
  first_eta TIMESTAMP WITH TIME ZONE,
  promised_eta TIMESTAMP WITH TIME ZONE,
  
  -- Actual Times
  actual_pickup_time TIMESTAMP WITH TIME ZONE,
  actual_delivery_time TIMESTAMP WITH TIME ZONE,
  
  -- Cancellation
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancelled_by TEXT, -- 'customer', 'rider', 'merchant', 'system', 'agent'
  cancelled_by_id BIGINT,
  cancelled_by_type TEXT CHECK (cancelled_by_type IS NULL OR cancelled_by_type IN ('store', 'customer', 'system', 'rider', 'admin')),
  cancellation_reason_id BIGINT REFERENCES public.order_cancellation_reasons(id) ON DELETE SET NULL,
  cancellation_reason TEXT,
  cancellation_details JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- MERCHANT DETAILS (Snapshot at order creation)
  -- ==========================================================================
  merchant_id BIGINT, -- Legacy merchant reference
  merchant_name TEXT,
  merchant_address TEXT,
  merchant_phone TEXT,
  merchant_email TEXT,
  merchant_store_name TEXT,
  merchant_cuisine_types TEXT[],
  merchant_avg_prep_time INTEGER,
  merchant_commission_rate NUMERIC(5, 2),
  merchant_gst_number TEXT,
  
  -- ==========================================================================
  -- CUSTOMER DETAILS (Snapshot at order creation)
  -- ==========================================================================
  customer_name TEXT,
  customer_mobile TEXT,
  customer_email TEXT,
  customer_address_id BIGINT REFERENCES public.customer_addresses(id) ON DELETE SET NULL,
  
  -- Delivery Address Details
  delivery_address_auto TEXT,
  delivery_address_manual TEXT,
  alternate_mobiles TEXT[],
  landmark TEXT,
  pincode TEXT,
  
  -- Order For (Gifting)
  is_self_order BOOLEAN DEFAULT TRUE,
  order_for_name TEXT,
  order_for_mobile TEXT,
  order_for_relation TEXT,
  
  -- Delivery Preferences
  contact_less_delivery BOOLEAN DEFAULT FALSE,
  special_delivery_notes TEXT,
  delivery_instructions TEXT,
  
  -- ==========================================================================
  -- DEVICE & APP INFO
  -- ==========================================================================
  device_type TEXT,
  device_os TEXT,
  device_app_version TEXT,
  device_ip TEXT,
  user_agent TEXT,
  created_via TEXT DEFAULT 'app', -- 'app', 'web', 'api', 'admin'
  created_by_user_id INTEGER REFERENCES public.system_users(id) ON DELETE SET NULL,
  
  -- ==========================================================================
  -- DELIVERY TYPE & DETAILS
  -- ==========================================================================
  delivery_type delivery_type DEFAULT 'standard',
  delivery_initiator delivery_initiator_type DEFAULT 'customer',
  locality_type locality_type,
  delivered_by TEXT, -- 'rider', 'merchant', 'self', '3pl'
  
  -- Kitchen Prep Time (Food orders)
  default_system_kpt_minutes INTEGER, -- Kitchen Prep Time
  merchant_updated_kpt_minutes INTEGER,
  
  -- ==========================================================================
  -- BULK ORDER SUPPORT
  -- ==========================================================================
  is_bulk_order BOOLEAN NOT NULL DEFAULT FALSE,
  bulk_reason TEXT,
  bulk_order_group_id TEXT,
  
  -- ==========================================================================
  -- PROVIDER INTEGRATION
  -- ==========================================================================
  -- External Provider References
  provider_order_id TEXT,
  provider_reference TEXT,
  external_order_id TEXT,
  buyer_app_name TEXT,
  
  -- Provider Status Sync
  synced_with_provider BOOLEAN DEFAULT FALSE,
  sync_status TEXT, -- 'synced', 'pending', 'failed', 'conflict'
  sync_error TEXT,
  sync_retry_count INTEGER DEFAULT 0,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  provider_status TEXT, -- Provider's status (may differ from ours)
  provider_status_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- Provider-Specific IDs (Swiggy, Zomato, Rapido)
  swiggy_order_id TEXT,
  swiggy_restaurant_id TEXT,
  swiggy_customer_id TEXT,
  swiggy_delivery_partner_id TEXT,
  
  zomato_order_id TEXT,
  zomato_restaurant_id TEXT,
  zomato_customer_id TEXT,
  zomato_delivery_partner_id TEXT,
  
  rapido_booking_id TEXT,
  rapido_rider_id TEXT,
  rapido_customer_id TEXT,
  rapido_trip_id TEXT,
  
  ondc_order_id TEXT,
  shiprocket_shipment_id TEXT,
  
  -- Provider Financials
  provider_fare_amount NUMERIC(12, 2),
  provider_commission NUMERIC(12, 2),
  provider_rider_payout NUMERIC(12, 2),
  provider_webhook_data JSONB DEFAULT '{}',
  provider_created_at TIMESTAMP WITH TIME ZONE,
  provider_updated_at TIMESTAMP WITH TIME ZONE,
  provider_customer_id TEXT,
  provider_merchant_id TEXT,
  provider_restaurant_id TEXT,
  
  -- Webhook Event Reference
  webhook_event_id BIGINT REFERENCES public.webhook_events(id) ON DELETE SET NULL,
  
  -- ==========================================================================
  -- 3PL PROVIDER INTEGRATION
  -- ==========================================================================
  tpl_provider_id BIGINT REFERENCES public.tpl_providers(id) ON DELETE SET NULL,
  tpl_order_request_id BIGINT REFERENCES public.tpl_order_requests(id) ON DELETE SET NULL,
  tpl_inbound_order_id BIGINT REFERENCES public.tpl_inbound_orders(id) ON DELETE SET NULL,
  is_tpl_order BOOLEAN DEFAULT FALSE,
  tpl_direction TEXT CHECK (tpl_direction IS NULL OR tpl_direction IN ('outbound', 'inbound')),
  assignment_provider TEXT, -- 'internal', '3pl', provider name
  
  -- ==========================================================================
  -- SERVICE-SPECIFIC FIELDS (Denormalized for quick access)
  -- ==========================================================================
  -- Food Service Fields
  restaurant_name TEXT,
  restaurant_phone TEXT,
  preparation_time_minutes INTEGER,
  food_items_count INTEGER,
  food_items_total_value NUMERIC(12, 2),
  requires_utensils BOOLEAN DEFAULT FALSE,
  veg_non_veg veg_non_veg_type,
  
  -- Parcel Service Fields
  package_weight_kg NUMERIC(5, 2),
  package_length_cm NUMERIC(5, 2),
  package_width_cm NUMERIC(5, 2),
  package_height_cm NUMERIC(5, 2),
  package_value NUMERIC(12, 2),
  is_fragile BOOLEAN DEFAULT FALSE,
  is_cod BOOLEAN DEFAULT FALSE,
  cod_amount NUMERIC(12, 2),
  requires_signature BOOLEAN DEFAULT FALSE,
  requires_otp_verification BOOLEAN DEFAULT FALSE,
  insurance_required BOOLEAN DEFAULT FALSE,
  insurance_amount NUMERIC(12, 2),
  package_description TEXT,
  
  -- Ride Service Fields
  passenger_name TEXT,
  passenger_phone TEXT,
  passenger_count INTEGER DEFAULT 1,
  ride_type TEXT, -- 'shared', 'private', 'premium', 'economy', 'luxury'
  vehicle_type_required TEXT, -- 'bike', 'car', 'auto', 'suv', 'van'
  base_fare NUMERIC(10, 2),
  distance_fare NUMERIC(10, 2),
  time_fare NUMERIC(10, 2),
  surge_multiplier NUMERIC(3, 2) DEFAULT 1.0,
  toll_charges NUMERIC(10, 2) DEFAULT 0,
  parking_charges NUMERIC(10, 2) DEFAULT 0,
  waiting_charges NUMERIC(10, 2) DEFAULT 0,
  scheduled_ride BOOLEAN DEFAULT FALSE,
  scheduled_pickup_time TIMESTAMP WITH TIME ZONE,
  return_trip BOOLEAN DEFAULT FALSE,
  return_pickup_address TEXT,
  return_pickup_lat NUMERIC(10, 7),
  return_pickup_lon NUMERIC(10, 7),
  return_pickup_time TIMESTAMP WITH TIME ZONE,
  
  -- ==========================================================================
  -- ASSIGNMENT & RIDER INFO
  -- ==========================================================================
  rider_id INTEGER REFERENCES public.riders(id) ON DELETE SET NULL, -- Legacy, use current_rider_id
  assigned_via TEXT DEFAULT 'auto', -- 'auto', 'manual', 'broadcast', 'rider_request'
  
  -- ==========================================================================
  -- REFUND & AGENT ACTIONS
  -- ==========================================================================
  refund_status TEXT,
  refund_amount NUMERIC(12, 2) DEFAULT 0 CHECK (refund_amount >= 0),
  last_agent_action TEXT,
  last_agent_id INTEGER REFERENCES public.system_users(id) ON DELETE SET NULL,
  last_agent_action_at TIMESTAMP WITH TIME ZONE,
  
  -- ==========================================================================
  -- RISK & FLAGS
  -- ==========================================================================
  risk_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  risk_reason TEXT,
  priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  special_requirements TEXT[],
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  order_metadata JSONB DEFAULT '{}',
  items JSONB, -- Denormalized items snapshot (for quick access)
  
  -- ==========================================================================
  -- LEGACY FIELDS (For backward compatibility)
  -- ==========================================================================
  food_order_status order_status_type, -- Legacy food order status
  parent_merchant_id TEXT, -- Legacy merchant parent reference
  contact_person_name TEXT,
  contact_person_phone TEXT,
  delivery_proof_url TEXT,
  delivery_proof_type TEXT,
  customer_rating SMALLINT CHECK (customer_rating IS NULL OR (customer_rating >= 1 AND customer_rating <= 5)),
  customer_feedback TEXT
);

-- ============================================================================
-- SET ORDER ID SEQUENCE TO START AT 1000000
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'orders_id_seq'
      AND n.nspname = 'public'
  ) THEN
    -- Only restart if current value is less than 1000000
    IF (SELECT last_value FROM orders_id_seq) < 1000000 THEN
      ALTER SEQUENCE orders_id_seq RESTART WITH 1000000;
    END IF;
  ELSE
    -- Create sequence if it doesn't exist
    CREATE SEQUENCE orders_id_seq START WITH 1000000;
    ALTER TABLE orders ALTER COLUMN id SET DEFAULT nextval('orders_id_seq');
  END IF;
END $$;

-- ============================================================================
-- CREATE INITIAL INDEXES FOR PERFORMANCE
-- ============================================================================

-- Ensure columns exist (for backward compatibility if table already exists)
DO $$
BEGIN
  -- Add order_uuid column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'orders' 
      AND column_name = 'order_uuid'
  ) THEN
    -- Add column with default first
    ALTER TABLE public.orders 
      ADD COLUMN order_uuid UUID DEFAULT gen_random_uuid();
    
    -- Populate order_uuid for existing rows that are NULL
    UPDATE public.orders 
    SET order_uuid = gen_random_uuid() 
    WHERE order_uuid IS NULL;
    
    -- Add UNIQUE constraint if not exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'orders_order_uuid_key'
    ) THEN
      ALTER TABLE public.orders 
        ADD CONSTRAINT orders_order_uuid_key UNIQUE (order_uuid);
    END IF;
  END IF;
  
  -- Add formatted_order_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'orders' 
      AND column_name = 'formatted_order_id'
  ) THEN
    -- Add column without UNIQUE constraint first (to avoid issues with existing NULL values)
    ALTER TABLE public.orders 
      ADD COLUMN formatted_order_id TEXT;
    
    -- Add UNIQUE constraint if not exists (using index name)
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND tablename = 'orders' 
        AND indexname = 'orders_formatted_order_id_key'
    ) THEN
      CREATE UNIQUE INDEX orders_formatted_order_id_key 
        ON public.orders(formatted_order_id) 
        WHERE formatted_order_id IS NOT NULL;
    END IF;
    
    -- Generate formatted_order_id for existing rows (optional, can be done later via trigger/function)
    -- UPDATE public.orders 
    -- SET formatted_order_id = 'ORD-' || TO_CHAR(created_at, 'YYYY') || '-' || LPAD(id::TEXT, 6, '0')
    -- WHERE formatted_order_id IS NULL;
  END IF;
  
  -- Add current_rider_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'orders' 
      AND column_name = 'current_rider_id'
  ) THEN
    ALTER TABLE public.orders 
      ADD COLUMN current_rider_id INTEGER REFERENCES public.riders(id) ON DELETE SET NULL;
    
    -- Populate current_rider_id from rider_id if rider_id exists
    UPDATE public.orders 
    SET current_rider_id = rider_id 
    WHERE current_rider_id IS NULL 
      AND rider_id IS NOT NULL;
  END IF;
END $$;

-- Primary Key Indexes (already created by PRIMARY KEY constraint)
-- id, order_uuid, formatted_order_id are already indexed

-- Foreign Key Indexes
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON public.orders(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_merchant_store_id_idx ON public.orders(merchant_store_id) WHERE merchant_store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_merchant_parent_id_idx ON public.orders(merchant_parent_id) WHERE merchant_parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_current_rider_id_idx ON public.orders(current_rider_id) WHERE current_rider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_rider_id_idx ON public.orders(rider_id) WHERE rider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_cancellation_reason_id_idx ON public.orders(cancellation_reason_id) WHERE cancellation_reason_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_customer_address_id_idx ON public.orders(customer_address_id) WHERE customer_address_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_tpl_provider_id_idx ON public.orders(tpl_provider_id) WHERE tpl_provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_tpl_order_request_id_idx ON public.orders(tpl_order_request_id) WHERE tpl_order_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_tpl_inbound_order_id_idx ON public.orders(tpl_inbound_order_id) WHERE tpl_inbound_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_webhook_event_id_idx ON public.orders(webhook_event_id) WHERE webhook_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_created_by_user_id_idx ON public.orders(created_by_user_id) WHERE created_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_last_agent_id_idx ON public.orders(last_agent_id) WHERE last_agent_id IS NOT NULL;

-- Status Query Indexes
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders(status);
CREATE INDEX IF NOT EXISTS orders_status_created_at_idx ON public.orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_order_type_status_idx ON public.orders(order_type, status);
CREATE INDEX IF NOT EXISTS orders_order_source_status_idx ON public.orders(order_source, status);
CREATE INDEX IF NOT EXISTS orders_current_status_idx ON public.orders(current_status) WHERE current_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON public.orders(payment_status) WHERE payment_status IS NOT NULL;

-- Time-Based Indexes
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_updated_at_idx ON public.orders(updated_at DESC);
CREATE INDEX IF NOT EXISTS orders_estimated_delivery_time_idx ON public.orders(estimated_delivery_time) WHERE estimated_delivery_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_actual_delivery_time_idx ON public.orders(actual_delivery_time) WHERE actual_delivery_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_cancelled_at_idx ON public.orders(cancelled_at) WHERE cancelled_at IS NOT NULL;

-- Provider Sync Indexes
CREATE INDEX IF NOT EXISTS orders_provider_order_id_idx ON public.orders(provider_order_id, order_source) WHERE provider_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_external_order_id_idx ON public.orders(external_order_id) WHERE external_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_sync_status_idx ON public.orders(sync_status) WHERE sync_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_tpl_provider_status_idx ON public.orders(tpl_provider_id, status) WHERE tpl_provider_id IS NOT NULL;

-- Composite Indexes for Common Queries
CREATE INDEX IF NOT EXISTS orders_customer_type_created_idx ON public.orders(customer_id, order_type, created_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_merchant_status_created_idx ON public.orders(merchant_store_id, status, created_at DESC) WHERE merchant_store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_rider_status_created_idx ON public.orders(current_rider_id, status, created_at DESC) WHERE current_rider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_type_source_status_idx ON public.orders(order_type, order_source, status);

-- Location-Based Indexes (for geospatial queries)
CREATE INDEX IF NOT EXISTS orders_pickup_location_idx ON public.orders USING GIST (point(pickup_lon, pickup_lat)) WHERE pickup_lat IS NOT NULL AND pickup_lon IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_drop_location_idx ON public.orders USING GIST (point(drop_lon, drop_lat)) WHERE drop_lat IS NOT NULL AND drop_lon IS NOT NULL;

-- Bulk Order Indexes
CREATE INDEX IF NOT EXISTS orders_bulk_order_group_id_idx ON public.orders(bulk_order_group_id) WHERE bulk_order_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_is_bulk_order_idx ON public.orders(is_bulk_order) WHERE is_bulk_order = TRUE;

-- ============================================================================
-- TABLE COMMENTS
-- ============================================================================

COMMENT ON TABLE public.orders IS 'Unified orders table - Single Source of Truth for all order types (food, parcel, ride, 3pl). Order ID starts at 1000000. Supports internal orders and external provider orders (Swiggy, Zomato, Rapido, ONDC, Shiprocket).';
COMMENT ON COLUMN public.orders.id IS 'Primary key. BIGSERIAL starting at 1000000 (6+ digits).';
COMMENT ON COLUMN public.orders.order_uuid IS 'UUID for external API references. Unique identifier for external systems.';
COMMENT ON COLUMN public.orders.formatted_order_id IS 'Human-readable order ID (e.g., ORD-2024-001234).';
COMMENT ON COLUMN public.orders.order_type IS 'Service type: food, parcel, ride, or 3pl.';
COMMENT ON COLUMN public.orders.order_category IS 'Category classification (same as order_type for most cases).';
COMMENT ON COLUMN public.orders.order_source IS 'Source of order: internal app or external provider (Swiggy, Zomato, Rapido, ONDC, Shiprocket, other).';
COMMENT ON COLUMN public.orders.current_rider_id IS 'Denormalized current rider ID for quick access. Synced from order_rider_assignments.';
COMMENT ON COLUMN public.orders.current_status IS 'Denormalized current status for performance. Synced from order_timeline.';
COMMENT ON COLUMN public.orders.status IS 'Current order status enum. Use order_timeline for immutable history.';
COMMENT ON COLUMN public.orders.payment_status IS 'Payment status: pending, processing, completed, failed, refunded, partially_refunded, cancelled.';
COMMENT ON COLUMN public.orders.order_metadata IS 'Flexible JSONB storage for provider-specific or custom fields.';
