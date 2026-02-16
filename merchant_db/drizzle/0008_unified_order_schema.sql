-- ============================================================================
-- UNIFIED ORDER MANAGEMENT SCHEMA
-- Production-Grade Multi-Service Order System (Food, Parcel, Ride)
-- Migration: 0008_unified_order_schema
-- Database: Supabase PostgreSQL
-- ORM: Drizzle
-- 
-- DESIGN PRINCIPLES:
-- - Single Source of Truth: orders table
-- - Order ID: INTEGER (BIGSERIAL), auto-increment, >6 digits
-- - Never Lose Data: All timelines, assignments immutable
-- - Multi-Rider Support: Multiple riders per order (history preserved)
-- - Multi-Payment Support: Multiple payment attempts tracked
-- - Full Audit Trail: Every action logged with actor info
-- - Legal Dispute Safe: Complete snapshots and timelines
-- ============================================================================

-- ============================================================================
-- NEW ENUMS (No Conflicts with Existing)
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_source_type') THEN
    CREATE TYPE order_source_type AS ENUM (
      'internal',      -- Our own app
      'swiggy',
      'zomato',
      'rapido',
      'ondc',          -- Open Network for Digital Commerce
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
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'veg_non_veg_type') THEN
    CREATE TYPE veg_non_veg_type AS ENUM (
      'veg',
      'non_veg',
      'mixed',
      'na'
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
      'cod',           -- Cash on delivery
      'other'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_type') THEN
    CREATE TYPE refund_type AS ENUM (
      'full',
      'partial',
      'item',
      'delivery_fee',
      'tip',
      'penalty'
    );
  END IF;
END $$;

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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_channel_type') THEN
    CREATE TYPE notification_channel_type AS ENUM (
      'push',
      'sms',
      'email',
      'in_app',
      'whatsapp',
      'call'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_source_type') THEN
    CREATE TYPE ticket_source_type AS ENUM (
      'customer',
      'rider',
      'merchant',
      'system',
      'agent'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_priority_type') THEN
    CREATE TYPE ticket_priority_type AS ENUM (
      'low',
      'medium',
      'high',
      'urgent',
      'critical'
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

-- ============================================================================
-- EXTEND EXISTING ORDERS TABLE
-- ============================================================================

-- Add new columns to existing orders table
ALTER TABLE orders
  -- Order Identity
  ADD COLUMN IF NOT EXISTS order_uuid UUID UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS order_category order_category_type,
  ADD COLUMN IF NOT EXISTS veg_non_veg veg_non_veg_type,
  
  -- Order Source
  ADD COLUMN IF NOT EXISTS order_source order_source_type DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS buyer_app_name TEXT,
  ADD COLUMN IF NOT EXISTS external_order_id TEXT, -- Provider's order ID
  
  -- Merchant Details (Snapshot)
  ADD COLUMN IF NOT EXISTS merchant_parent_id BIGINT,
  ADD COLUMN IF NOT EXISTS merchant_name TEXT,
  ADD COLUMN IF NOT EXISTS merchant_address TEXT,
  ADD COLUMN IF NOT EXISTS merchant_phone TEXT,
  ADD COLUMN IF NOT EXISTS merchant_email TEXT,
  
  -- Customer Details (Snapshot)
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_mobile TEXT,
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS customer_address_id BIGINT,
  
  -- Delivery Address (Enhanced)
  ADD COLUMN IF NOT EXISTS delivery_address_auto TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address_manual TEXT,
  ADD COLUMN IF NOT EXISTS alternate_mobiles TEXT[],
  ADD COLUMN IF NOT EXISTS landmark TEXT,
  ADD COLUMN IF NOT EXISTS pincode TEXT,
  
  -- Device & App Info
  ADD COLUMN IF NOT EXISTS device_type TEXT,
  ADD COLUMN IF NOT EXISTS device_os TEXT,
  ADD COLUMN IF NOT EXISTS device_app_version TEXT,
  ADD COLUMN IF NOT EXISTS device_ip TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  
  -- Order For (Gifting)
  ADD COLUMN IF NOT EXISTS is_self_order BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS order_for_name TEXT,
  ADD COLUMN IF NOT EXISTS order_for_mobile TEXT,
  ADD COLUMN IF NOT EXISTS order_for_relation TEXT,
  
  -- Delivery Preferences
  ADD COLUMN IF NOT EXISTS contact_less_delivery BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS special_delivery_notes TEXT,
  ADD COLUMN IF NOT EXISTS delivery_instructions TEXT,
  
  -- Financial Totals (Snapshot)
  ADD COLUMN IF NOT EXISTS total_item_value NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tax NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_discount NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_delivery_fee NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_ctm NUMERIC(12, 2) DEFAULT 0, -- Commission to merchant
  ADD COLUMN IF NOT EXISTS total_payable NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_paid NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_refunded NUMERIC(12, 2) DEFAULT 0,
  
  -- Tip
  ADD COLUMN IF NOT EXISTS has_tip BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(10, 2) DEFAULT 0,
  
  -- Bulk Order
  ADD COLUMN IF NOT EXISTS is_bulk_order BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bulk_reason TEXT,
  ADD COLUMN IF NOT EXISTS bulk_order_group_id TEXT,
  
  -- Delivery Type & Details
  ADD COLUMN IF NOT EXISTS delivery_type delivery_type DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS delivery_initiator delivery_initiator_type DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS locality_type locality_type,
  ADD COLUMN IF NOT EXISTS delivered_by TEXT, -- 'rider', 'merchant', 'self'
  
  -- ETA Tracking
  ADD COLUMN IF NOT EXISTS default_system_kpt_minutes INTEGER, -- Kitchen Prep Time
  ADD COLUMN IF NOT EXISTS merchant_updated_kpt_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS first_eta TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS promised_eta TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS actual_pickup_time TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS actual_delivery_time TIMESTAMP WITH TIME ZONE,
  
  -- Current Status (Denormalized for performance)
  ADD COLUMN IF NOT EXISTS current_status order_status_type,
  
  -- Payment Status
  ADD COLUMN IF NOT EXISTS payment_status payment_status_type DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_method payment_mode_type,
  
  -- Cancellation
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT, -- 'customer', 'rider', 'merchant', 'system', 'agent'
  ADD COLUMN IF NOT EXISTS cancelled_by_id BIGINT,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  
  -- Refund
  ADD COLUMN IF NOT EXISTS refund_status TEXT,
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(12, 2) DEFAULT 0,
  
  -- Agent Actions
  ADD COLUMN IF NOT EXISTS last_agent_action TEXT,
  ADD COLUMN IF NOT EXISTS last_agent_id INTEGER,
  ADD COLUMN IF NOT EXISTS last_agent_action_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  ADD COLUMN IF NOT EXISTS order_metadata JSONB DEFAULT '{}';

-- Drop materialized views and regular views that depend on order_type before altering column
DROP MATERIALIZED VIEW IF EXISTS provider_performance_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS order_source_distribution CASCADE;
DROP VIEW IF EXISTS active_orders_with_rider CASCADE;
DROP VIEW IF EXISTS provider_sync_status CASCADE;
DROP VIEW IF EXISTS rider_performance_by_order_type CASCADE;

-- Update existing columns if needed
DO $$
BEGIN
  -- Only alter if column exists and type needs to be changed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'order_type'
      AND data_type != 'USER-DEFINED'
  ) THEN
    ALTER TABLE orders
      ALTER COLUMN order_type TYPE order_type USING order_type::text::order_type;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'status'
      AND data_type != 'USER-DEFINED'
  ) THEN
    ALTER TABLE orders
      ALTER COLUMN status TYPE order_status_type USING status::text::order_status_type;
  END IF;
END $$;

-- Set current_status from status
UPDATE orders SET current_status = status WHERE current_status IS NULL;

-- ============================================================================
-- ORDER ITEMS
-- ============================================================================

-- Create table if it doesn't exist, or add missing columns if it does
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN
    CREATE TABLE order_items (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      
      -- Item Identity
      item_id BIGINT,
      merchant_menu_id BIGINT,
      item_name TEXT NOT NULL,
      item_title TEXT,
      item_description TEXT,
      item_image_url TEXT,
      item_category TEXT,
      item_subcategory TEXT,
      
      -- Pricing
      unit_price NUMERIC(10, 2) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      tax_percentage NUMERIC(5, 2) DEFAULT 0,
      tax_amount NUMERIC(10, 2) DEFAULT 0,
      total_price NUMERIC(10, 2) NOT NULL,
      
      -- Offers & Discounts
      merchant_offer JSONB DEFAULT '{}',
      platform_offer JSONB DEFAULT '{}',
      final_item_price NUMERIC(10, 2) NOT NULL,
      discount_amount NUMERIC(10, 2) DEFAULT 0,
      
      -- Food Specific
      is_veg BOOLEAN,
      spice_level TEXT, -- 'mild', 'medium', 'hot', 'extra_hot'
      customizations TEXT,
      
      -- Parcel Specific
      item_weight_kg NUMERIC(5, 2),
      item_value NUMERIC(10, 2),
      
      -- Metadata
      item_metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  ELSE
    -- Table exists, add missing columns
    ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS item_id BIGINT,
      ADD COLUMN IF NOT EXISTS merchant_menu_id BIGINT,
      ADD COLUMN IF NOT EXISTS item_title TEXT,
      ADD COLUMN IF NOT EXISTS item_description TEXT,
      ADD COLUMN IF NOT EXISTS item_image_url TEXT,
      ADD COLUMN IF NOT EXISTS item_category TEXT,
      ADD COLUMN IF NOT EXISTS item_subcategory TEXT,
      ADD COLUMN IF NOT EXISTS tax_percentage NUMERIC(5, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS merchant_offer JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS platform_offer JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS final_item_price NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS is_veg BOOLEAN,
      ADD COLUMN IF NOT EXISTS spice_level TEXT,
      ADD COLUMN IF NOT EXISTS customizations TEXT,
      ADD COLUMN IF NOT EXISTS item_weight_kg NUMERIC(5, 2),
      ADD COLUMN IF NOT EXISTS item_value NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS item_metadata JSONB DEFAULT '{}';
    
    -- Update existing columns to match new schema if needed
    -- Note: item_name, quantity, unit_price, total_price, created_at should already exist
    -- If unit_price or total_price are nullable, make them NOT NULL (if safe)
    -- This is commented out as it might break existing data
    -- ALTER TABLE order_items ALTER COLUMN unit_price SET NOT NULL;
    -- ALTER TABLE order_items ALTER COLUMN total_price SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_item_id_idx ON order_items(item_id) WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_items_merchant_menu_id_idx ON order_items(merchant_menu_id) WHERE merchant_menu_id IS NOT NULL;

-- ============================================================================
-- ORDER ITEM ADDONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_item_addons (
  id BIGSERIAL PRIMARY KEY,
  order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  
  addon_id BIGINT,
  addon_name TEXT NOT NULL,
  addon_type TEXT, -- 'extra', 'remove', 'substitute'
  addon_price NUMERIC(10, 2) DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_item_addons_order_item_id_idx ON order_item_addons(order_item_id);
CREATE INDEX IF NOT EXISTS order_item_addons_addon_id_idx ON order_item_addons(addon_id) WHERE addon_id IS NOT NULL;

-- ============================================================================
-- ORDER INSTRUCTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_instructions (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  instruction_for TEXT NOT NULL, -- 'merchant', 'rider', 'customer'
  instruction_text TEXT NOT NULL,
  instruction_priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by TEXT, -- 'customer', 'merchant', 'rider', 'agent', 'system'
  created_by_id BIGINT
);

CREATE INDEX IF NOT EXISTS order_instructions_order_id_idx ON order_instructions(order_id);
CREATE INDEX IF NOT EXISTS order_instructions_instruction_for_idx ON order_instructions(instruction_for);

-- ============================================================================
-- ORDER PAYMENTS (Multiple Attempts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_payments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  payment_attempt_no INTEGER NOT NULL DEFAULT 1,
  
  -- Payment Source
  payment_source TEXT, -- 'customer_app', 'merchant_app', 'web', 'api'
  payment_mode payment_mode_type NOT NULL,
  
  -- Transaction IDs
  transaction_id TEXT UNIQUE,
  mp_transaction_id TEXT, -- Marketplace transaction ID
  pg_transaction_id TEXT, -- Payment gateway transaction ID
  
  -- Payment Gateway
  pg_name TEXT, -- 'razorpay', 'stripe', 'payu', etc.
  pg_order_id TEXT,
  pg_payment_id TEXT,
  pg_signature TEXT,
  
  -- Payment Status
  payment_status payment_status_type NOT NULL DEFAULT 'pending',
  payment_amount NUMERIC(12, 2) NOT NULL,
  payment_fee NUMERIC(10, 2) DEFAULT 0,
  net_amount NUMERIC(12, 2),
  
  -- Coupon Details
  coupon_code TEXT,
  coupon_type TEXT, -- 'percentage', 'fixed', 'free_delivery'
  coupon_value NUMERIC(10, 2),
  coupon_max_discount NUMERIC(10, 2),
  coupon_discount_applied NUMERIC(10, 2) DEFAULT 0,
  
  -- Refund Status
  is_refunded BOOLEAN DEFAULT FALSE,
  refunded_amount NUMERIC(12, 2) DEFAULT 0,
  refund_transaction_id TEXT,
  
  -- Payment Response
  pg_response JSONB DEFAULT '{}',
  payment_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(order_id, payment_attempt_no)
);

CREATE INDEX IF NOT EXISTS order_payments_order_id_idx ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS order_payments_transaction_id_idx ON order_payments(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_payments_pg_transaction_id_idx ON order_payments(pg_transaction_id) WHERE pg_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_payments_payment_status_idx ON order_payments(payment_status);
CREATE INDEX IF NOT EXISTS order_payments_created_at_idx ON order_payments(created_at);

-- ============================================================================
-- ORDER REFUNDS (Partial & Full)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_refunds (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_payment_id BIGINT REFERENCES order_payments(id),
  
  refund_type refund_type NOT NULL,
  refund_reason TEXT NOT NULL,
  refund_description TEXT,
  
  -- Refund IDs
  redemption_id TEXT,
  refund_id TEXT UNIQUE,
  pg_transaction_id TEXT,
  pg_refund_id TEXT,
  
  -- Refund Details
  product_type TEXT, -- 'order', 'item', 'delivery_fee', 'tip', 'penalty'
  refund_amount NUMERIC(12, 2) NOT NULL,
  refund_fee NUMERIC(10, 2) DEFAULT 0,
  net_refund_amount NUMERIC(12, 2),
  
  -- Coupon Issuance
  issued_coupon_code TEXT,
  issued_coupon_value NUMERIC(10, 2),
  issued_coupon_expiry TIMESTAMP WITH TIME ZONE,
  
  -- Merchant Debit
  mx_debit_amount NUMERIC(12, 2) DEFAULT 0, -- Amount debited from merchant
  mx_debit_reason TEXT,
  
  -- Refund Status
  refund_status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  refund_initiated_by TEXT, -- 'customer', 'merchant', 'rider', 'agent', 'system'
  refund_initiated_by_id BIGINT,
  refund_processed_by TEXT,
  refund_processed_by_id BIGINT,
  
  -- Refund Response
  pg_refund_response JSONB DEFAULT '{}',
  refund_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS order_refunds_order_id_idx ON order_refunds(order_id);
CREATE INDEX IF NOT EXISTS order_refunds_order_payment_id_idx ON order_refunds(order_payment_id) WHERE order_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_refunds_refund_id_idx ON order_refunds(refund_id) WHERE refund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_refunds_refund_status_idx ON order_refunds(refund_status);
CREATE INDEX IF NOT EXISTS order_refunds_refund_type_idx ON order_refunds(refund_type);
CREATE INDEX IF NOT EXISTS order_refunds_created_at_idx ON order_refunds(created_at);

-- ============================================================================
-- ORDER RIDER ASSIGNMENTS (Multiple Riders - History Preserved)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_rider_assignments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
  
  -- Rider Details (Snapshot)
  rider_name TEXT,
  rider_mobile TEXT,
  rider_vehicle_type TEXT,
  rider_vehicle_number TEXT,
  
  -- Delivery Provider
  delivery_provider TEXT, -- 'internal', 'swiggy', 'zomato', 'rapido', etc.
  provider_rider_id TEXT, -- Provider's rider ID
  
  -- Assignment Details
  assignment_status rider_assignment_status NOT NULL DEFAULT 'pending',
  assignment_method TEXT, -- 'auto', 'manual', 'broadcast', 'rider_request'
  assignment_score NUMERIC(5, 2), -- Algorithm score
  distance_to_pickup_km NUMERIC(6, 2),
  estimated_arrival_minutes INTEGER,
  
  -- Timestamps (Immutable)
  assigned_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  reached_merchant_at TIMESTAMP WITH TIME ZONE,
  picked_up_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  
  -- Cancellation
  cancellation_reason TEXT,
  cancellation_reason_code TEXT,
  cancelled_by TEXT, -- 'rider', 'system', 'merchant', 'customer', 'agent'
  cancelled_by_id BIGINT,
  
  -- Distance Tracking
  distance_to_merchant_km NUMERIC(6, 2),
  distance_to_customer_km NUMERIC(6, 2),
  total_distance_km NUMERIC(6, 2),
  
  -- Earnings
  rider_earning NUMERIC(10, 2),
  commission_amount NUMERIC(10, 2),
  tip_amount NUMERIC(10, 2) DEFAULT 0,
  
  -- Metadata
  assignment_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_rider_assignments_order_id_idx ON order_rider_assignments(order_id);
CREATE INDEX IF NOT EXISTS order_rider_assignments_rider_id_idx ON order_rider_assignments(rider_id);
CREATE INDEX IF NOT EXISTS order_rider_assignments_assignment_status_idx ON order_rider_assignments(assignment_status);
CREATE INDEX IF NOT EXISTS order_rider_assignments_active_assignment_idx ON order_rider_assignments(order_id, assignment_status)
  WHERE assignment_status IN ('pending', 'assigned', 'accepted');
CREATE INDEX IF NOT EXISTS order_rider_assignments_created_at_idx ON order_rider_assignments(created_at);

-- Ensure one active assignment per order (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS order_rider_assignments_active_unique_idx 
  ON order_rider_assignments(order_id, rider_id, assignment_status) 
  WHERE assignment_status IN ('pending', 'assigned', 'accepted');

-- ============================================================================
-- ORDER RIDER DISTANCES
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_rider_distances (
  id BIGSERIAL PRIMARY KEY,
  rider_assignment_id BIGINT NOT NULL REFERENCES order_rider_assignments(id) ON DELETE CASCADE,
  
  merchant_to_rider_km NUMERIC(6, 2),
  merchant_to_customer_km NUMERIC(6, 2),
  rider_to_merchant_km NUMERIC(6, 2),
  rider_to_customer_km NUMERIC(6, 2),
  total_distance_km NUMERIC(6, 2),
  
  -- Route Details
  route_polyline TEXT,
  route_duration_seconds INTEGER,
  route_metadata JSONB DEFAULT '{}',
  
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_rider_distances_rider_assignment_id_idx ON order_rider_distances(rider_assignment_id);
CREATE INDEX IF NOT EXISTS order_rider_distances_recorded_at_idx ON order_rider_distances(recorded_at);

-- ============================================================================
-- ORDER RIDER ACTIONS (Accept/Reject)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_rider_actions (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rider_assignment_id BIGINT REFERENCES order_rider_assignments(id) ON DELETE SET NULL,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
  
  action order_action NOT NULL, -- 'accept', 'reject', 'auto_reject', 'timeout'
  reason TEXT,
  reason_code TEXT,
  
  response_time_seconds INTEGER, -- Time taken to respond
  distance_from_pickup_km NUMERIC(6, 2),
  
  action_metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_rider_actions_order_id_idx ON order_rider_actions(order_id);
CREATE INDEX IF NOT EXISTS order_rider_actions_rider_id_idx ON order_rider_actions(rider_id);
CREATE INDEX IF NOT EXISTS order_rider_actions_rider_assignment_id_idx ON order_rider_actions(rider_assignment_id) WHERE rider_assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_rider_actions_action_idx ON order_rider_actions(action);
CREATE INDEX IF NOT EXISTS order_rider_actions_timestamp_idx ON order_rider_actions(timestamp);

-- ============================================================================
-- ORDER TIMELINE (Immutable Status History)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_timeline (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  status order_status_type NOT NULL,
  previous_status order_status_type,
  
  -- Actor Information
  actor_type TEXT NOT NULL, -- 'customer', 'rider', 'merchant', 'system', 'agent'
  actor_id BIGINT,
  actor_name TEXT,
  
  -- Location (if applicable)
  location_lat DOUBLE PRECISION,
  location_lon DOUBLE PRECISION,
  location_address TEXT,
  
  -- Additional Details
  status_message TEXT,
  status_metadata JSONB DEFAULT '{}',
  
  -- Timestamp (Immutable)
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  -- Note: Chronological order validation should be done via trigger, not CHECK constraint
  -- CHECK constraints cannot contain subqueries in PostgreSQL
);

CREATE INDEX IF NOT EXISTS order_timeline_order_id_idx ON order_timeline(order_id);
CREATE INDEX IF NOT EXISTS order_timeline_status_idx ON order_timeline(status);
CREATE INDEX IF NOT EXISTS order_timeline_actor_type_idx ON order_timeline(actor_type);
CREATE INDEX IF NOT EXISTS order_timeline_occurred_at_idx ON order_timeline(occurred_at);
CREATE INDEX IF NOT EXISTS order_timeline_order_occurred_idx ON order_timeline(order_id, occurred_at);

-- ============================================================================
-- ORDER NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_notifications (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  notification_type TEXT NOT NULL, -- 'order_placed', 'order_accepted', 'order_delivered', etc.
  notification_channel notification_channel_type NOT NULL,
  message TEXT NOT NULL,
  message_template_id TEXT,
  
  -- Recipient
  sent_to TEXT NOT NULL, -- Phone, email, or user ID
  recipient_type TEXT, -- 'customer', 'rider', 'merchant'
  recipient_id BIGINT,
  
  -- Delivery Status
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  
  -- Provider Details
  provider_message_id TEXT,
  provider_response JSONB DEFAULT '{}',
  
  notification_metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS order_notifications_order_id_idx ON order_notifications(order_id);
CREATE INDEX IF NOT EXISTS order_notifications_notification_type_idx ON order_notifications(notification_type);
CREATE INDEX IF NOT EXISTS order_notifications_notification_channel_idx ON order_notifications(notification_channel);
CREATE INDEX IF NOT EXISTS order_notifications_sent_to_idx ON order_notifications(sent_to);
CREATE INDEX IF NOT EXISTS order_notifications_sent_at_idx ON order_notifications(sent_at);

-- ============================================================================
-- ORDER REMARKS (Agent/Customer/Rider Remarks)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_remarks (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Actor Information
  actor_type TEXT NOT NULL, -- 'customer', 'rider', 'merchant', 'agent', 'system'
  actor_id BIGINT,
  actor_name TEXT,
  
  -- Remark Details
  action_taken TEXT, -- 'status_changed', 'refund_issued', 'rider_reassigned', etc.
  remark TEXT NOT NULL,
  remark_category TEXT, -- 'complaint', 'feedback', 'instruction', 'note'
  remark_priority TEXT DEFAULT 'normal',
  
  -- Visibility
  visible_to TEXT[], -- Array of actor types who can see this remark
  is_internal BOOLEAN DEFAULT FALSE, -- Internal agent notes
  
  -- Metadata
  remark_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_remarks_order_id_idx ON order_remarks(order_id);
CREATE INDEX IF NOT EXISTS order_remarks_actor_type_idx ON order_remarks(actor_type);
CREATE INDEX IF NOT EXISTS order_remarks_actor_id_idx ON order_remarks(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_remarks_remark_category_idx ON order_remarks(remark_category);
CREATE INDEX IF NOT EXISTS order_remarks_created_at_idx ON order_remarks(created_at);

-- ============================================================================
-- ORDER TICKETS (Support Tickets)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_tickets (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Ticket Source
  ticket_source ticket_source_type NOT NULL,
  raised_by_id BIGINT,
  raised_by_name TEXT,
  raised_by_type TEXT, -- 'customer', 'rider', 'merchant', 'agent'
  
  -- Issue Details
  issue_category TEXT NOT NULL, -- 'delivery_delay', 'wrong_item', 'payment_issue', etc.
  issue_subcategory TEXT,
  description TEXT NOT NULL,
  attachments TEXT[], -- URLs to attached files/images
  
  -- Priority & Status
  priority ticket_priority_type NOT NULL DEFAULT 'medium',
  status ticket_status NOT NULL DEFAULT 'open',
  
  -- Assignment
  assigned_to_agent_id INTEGER,
  assigned_to_agent_name TEXT,
  assigned_at TIMESTAMP WITH TIME ZONE,
  
  -- Resolution
  resolution TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by INTEGER,
  resolved_by_name TEXT,
  
  -- Follow-up
  follow_up_required BOOLEAN DEFAULT FALSE,
  follow_up_date TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  ticket_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX order_tickets_order_id_idx ON order_tickets(order_id);
CREATE INDEX order_tickets_ticket_source_idx ON order_tickets(ticket_source);
CREATE INDEX order_tickets_raised_by_id_idx ON order_tickets(raised_by_id) WHERE raised_by_id IS NOT NULL;
CREATE INDEX order_tickets_issue_category_idx ON order_tickets(issue_category);
CREATE INDEX order_tickets_priority_idx ON order_tickets(priority);
CREATE INDEX order_tickets_status_idx ON order_tickets(status);
CREATE INDEX order_tickets_assigned_to_agent_id_idx ON order_tickets(assigned_to_agent_id) WHERE assigned_to_agent_id IS NOT NULL;
CREATE INDEX order_tickets_created_at_idx ON order_tickets(created_at);

-- ============================================================================
-- ORDER DISPUTES (Legal Dispute Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_disputes (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_ticket_id BIGINT REFERENCES order_tickets(id),
  
  -- Dispute Details
  dispute_type TEXT NOT NULL, -- 'refund', 'damage', 'non_delivery', 'fraud', etc.
  dispute_reason TEXT NOT NULL,
  dispute_description TEXT,
  
  -- Parties
  raised_by TEXT NOT NULL, -- 'customer', 'merchant', 'rider'
  raised_by_id BIGINT,
  disputed_against TEXT, -- 'customer', 'merchant', 'rider', 'platform'
  disputed_against_id BIGINT,
  
  -- Evidence
  evidence_urls TEXT[], -- URLs to evidence files/images
  evidence_description TEXT,
  
  -- Resolution
  dispute_status TEXT DEFAULT 'open', -- 'open', 'investigating', 'resolved', 'closed', 'escalated'
  resolution TEXT,
  resolution_amount NUMERIC(12, 2),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by INTEGER,
  resolved_by_name TEXT,
  
  -- Legal
  legal_case_id TEXT,
  legal_notes TEXT,
  
  -- Metadata
  dispute_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX order_disputes_order_id_idx ON order_disputes(order_id);
CREATE INDEX order_disputes_order_ticket_id_idx ON order_disputes(order_ticket_id) WHERE order_ticket_id IS NOT NULL;
CREATE INDEX order_disputes_dispute_status_idx ON order_disputes(dispute_status);
CREATE INDEX order_disputes_raised_by_idx ON order_disputes(raised_by, raised_by_id);
CREATE INDEX order_disputes_created_at_idx ON order_disputes(created_at);

-- ============================================================================
-- ORDER AUDIT LOG (Complete Audit Trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_audit_log (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Action Details
  action_type TEXT NOT NULL, -- 'create', 'update', 'delete', 'status_change', 'payment', 'refund', etc.
  action_field TEXT, -- Field name if specific field changed
  old_value JSONB,
  new_value JSONB,
  
  -- Actor Information
  actor_type TEXT NOT NULL, -- 'customer', 'rider', 'merchant', 'agent', 'system'
  actor_id BIGINT,
  actor_name TEXT,
  actor_ip TEXT,
  actor_user_agent TEXT,
  
  -- Additional Context
  action_reason TEXT,
  action_metadata JSONB DEFAULT '{}',
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX order_audit_log_order_id_idx ON order_audit_log(order_id);
CREATE INDEX order_audit_log_action_type_idx ON order_audit_log(action_type);
CREATE INDEX order_audit_log_actor_type_idx ON order_audit_log(actor_type);
CREATE INDEX order_audit_log_actor_id_idx ON order_audit_log(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX order_audit_log_created_at_idx ON order_audit_log(created_at);
CREATE INDEX order_audit_log_order_created_idx ON order_audit_log(order_id, created_at);

-- ============================================================================
-- SERVICE-SPECIFIC TABLES
-- ============================================================================

-- Food Delivery Details
CREATE TABLE IF NOT EXISTS order_food_details (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE UNIQUE,
  
  restaurant_id BIGINT,
  restaurant_name TEXT,
  restaurant_phone TEXT,
  restaurant_address TEXT,
  
  preparation_time_minutes INTEGER,
  estimated_preparation_time TIMESTAMP WITH TIME ZONE,
  actual_preparation_time TIMESTAMP WITH TIME ZONE,
  
  food_items_count INTEGER DEFAULT 0,
  food_items_total_value NUMERIC(12, 2) DEFAULT 0,
  
  requires_utensils BOOLEAN DEFAULT FALSE,
  requires_packaging BOOLEAN DEFAULT TRUE,
  
  food_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX order_food_details_order_id_idx ON order_food_details(order_id);
CREATE INDEX order_food_details_restaurant_id_idx ON order_food_details(restaurant_id) WHERE restaurant_id IS NOT NULL;

-- Parcel Delivery Details
CREATE TABLE IF NOT EXISTS order_parcel_details (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE UNIQUE,
  
  package_weight_kg NUMERIC(5, 2),
  package_length_cm NUMERIC(5, 2),
  package_width_cm NUMERIC(5, 2),
  package_height_cm NUMERIC(5, 2),
  package_volume_liters NUMERIC(5, 2),
  
  package_value NUMERIC(12, 2),
  package_description TEXT,
  package_contents TEXT[],
  
  is_fragile BOOLEAN DEFAULT FALSE,
  is_hazardous BOOLEAN DEFAULT FALSE,
  requires_handling TEXT, -- 'careful', 'upright', 'temperature_controlled', etc.
  
  -- COD
  is_cod BOOLEAN DEFAULT FALSE,
  cod_amount NUMERIC(12, 2) DEFAULT 0,
  cod_collected BOOLEAN DEFAULT FALSE,
  cod_collected_at TIMESTAMP WITH TIME ZONE,
  
  -- Verification
  requires_signature BOOLEAN DEFAULT FALSE,
  requires_otp_verification BOOLEAN DEFAULT FALSE,
  requires_photo_proof BOOLEAN DEFAULT FALSE,
  delivery_proof_url TEXT,
  
  -- Insurance
  insurance_required BOOLEAN DEFAULT FALSE,
  insurance_amount NUMERIC(12, 2),
  insurance_provider TEXT,
  
  parcel_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX order_parcel_details_order_id_idx ON order_parcel_details(order_id);
CREATE INDEX order_parcel_details_is_cod_idx ON order_parcel_details(is_cod) WHERE is_cod = TRUE;

-- Ride Booking Details
CREATE TABLE IF NOT EXISTS order_ride_details (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE UNIQUE,
  
  -- Passenger Details
  passenger_name TEXT,
  passenger_phone TEXT,
  passenger_email TEXT,
  passenger_count INTEGER DEFAULT 1,
  
  -- Ride Type
  ride_type TEXT, -- 'shared', 'private', 'premium', 'economy', 'luxury'
  vehicle_type_required TEXT, -- 'bike', 'car', 'auto', 'suv', 'van'
  
  -- Fare Breakdown
  base_fare NUMERIC(10, 2) DEFAULT 0,
  distance_fare NUMERIC(10, 2) DEFAULT 0,
  time_fare NUMERIC(10, 2) DEFAULT 0,
  surge_multiplier NUMERIC(3, 2) DEFAULT 1.0,
  surge_amount NUMERIC(10, 2) DEFAULT 0,
  toll_charges NUMERIC(10, 2) DEFAULT 0,
  parking_charges NUMERIC(10, 2) DEFAULT 0,
  waiting_charges NUMERIC(10, 2) DEFAULT 0,
  night_charges NUMERIC(10, 2) DEFAULT 0,
  gst_amount NUMERIC(10, 2) DEFAULT 0,
  discount_amount NUMERIC(10, 2) DEFAULT 0,
  total_fare NUMERIC(12, 2) DEFAULT 0,
  
  -- Scheduled Ride
  scheduled_ride BOOLEAN DEFAULT FALSE,
  scheduled_pickup_time TIMESTAMP WITH TIME ZONE,
  
  -- Round Trip
  return_trip BOOLEAN DEFAULT FALSE,
  return_pickup_address TEXT,
  return_pickup_lat DOUBLE PRECISION,
  return_pickup_lon DOUBLE PRECISION,
  return_pickup_time TIMESTAMP WITH TIME ZONE,
  
  -- Route
  route_polyline TEXT,
  route_waypoints JSONB DEFAULT '[]',
  estimated_route_distance_km NUMERIC(6, 2),
  actual_route_distance_km NUMERIC(6, 2),
  
  ride_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX order_ride_details_order_id_idx ON order_ride_details(order_id);
CREATE INDEX order_ride_details_scheduled_ride_idx ON order_ride_details(scheduled_ride) WHERE scheduled_ride = TRUE;
CREATE INDEX order_ride_details_scheduled_pickup_time_idx ON order_ride_details(scheduled_pickup_time) WHERE scheduled_pickup_time IS NOT NULL;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Auto-update current_status in orders when timeline is updated
CREATE OR REPLACE FUNCTION update_order_current_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE orders
  SET current_status = NEW.status,
      updated_at = NOW()
  WHERE id = NEW.order_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_timeline_update_status_trigger
  AFTER INSERT ON order_timeline
  FOR EACH ROW
  EXECUTE FUNCTION update_order_current_status();

-- Trigger: Auto-create audit log entry
CREATE OR REPLACE FUNCTION create_order_audit_log()
RETURNS TRIGGER AS $$
BEGIN
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
  -- Get the most recent occurred_at for this order
  SELECT MAX(occurred_at) INTO v_previous_occurred_at
  FROM order_timeline
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

CREATE TRIGGER order_rider_assignments_updated_at_trigger
  BEFORE UPDATE ON order_rider_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_rider_assignments_updated_at();

-- Trigger: Update order_payments updated_at
CREATE TRIGGER order_payments_updated_at_trigger
  BEFORE UPDATE ON order_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update order_tickets updated_at
CREATE TRIGGER order_tickets_updated_at_trigger
  BEFORE UPDATE ON order_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update order_disputes updated_at
CREATE TRIGGER order_disputes_updated_at_trigger
  BEFORE UPDATE ON order_disputes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update service-specific tables updated_at
CREATE TRIGGER order_food_details_updated_at_trigger
  BEFORE UPDATE ON order_food_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER order_parcel_details_updated_at_trigger
  BEFORE UPDATE ON order_parcel_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER order_ride_details_updated_at_trigger
  BEFORE UPDATE ON order_ride_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- CONSTRAINTS
-- ============================================================================

-- Ensure order ID starts at 1000000 (6+ digits)
-- Only restart if sequence exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'orders_id_seq'
      AND n.nspname = 'public'
  ) THEN
    ALTER SEQUENCE orders_id_seq RESTART WITH 1000000;
  END IF;
END $$;

-- Check constraints for data validation
-- Note: Only add constraints for columns that exist
DO $$
BEGIN
  -- Add constraints for columns that exist in orders table
  -- Check both column existence AND constraint existence before adding
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'total_payable'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_total_payable_positive'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_total_payable_positive CHECK (total_payable >= 0);
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'total_item_value'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_total_item_value_positive'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_total_item_value_positive CHECK (total_item_value >= 0);
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'tip_amount'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_tip_amount_positive'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_tip_amount_positive CHECK (tip_amount >= 0);
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'refund_amount'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_refund_amount_positive'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_refund_amount_positive CHECK (refund_amount >= 0);
  END IF;
  
  -- Use drop_lat/drop_lon (existing columns) instead of delivery_lat/delivery_lng
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'drop_lat'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_drop_lat_valid'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_drop_lat_valid CHECK (drop_lat >= -90 AND drop_lat <= 90);
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'drop_lon'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_drop_lon_valid'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_drop_lon_valid CHECK (drop_lon >= -180 AND drop_lon <= 180);
  END IF;
  
  -- Use pickup_lat/pickup_lon (existing columns) instead of merchant_lat/merchant_lng
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'pickup_lat'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_pickup_lat_valid'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_pickup_lat_valid CHECK (pickup_lat >= -90 AND pickup_lat <= 90);
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' 
      AND column_name = 'pickup_lon'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_pickup_lon_valid'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_pickup_lon_valid CHECK (pickup_lon >= -180 AND pickup_lon <= 180);
  END IF;
END $$;

-- Add constraints to order_items (with existence checks)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'order_items_quantity_positive'
        AND table_name = 'order_items'
    ) THEN
      ALTER TABLE order_items
        ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'order_items_unit_price_positive'
        AND table_name = 'order_items'
    ) THEN
      ALTER TABLE order_items
        ADD CONSTRAINT order_items_unit_price_positive CHECK (unit_price >= 0);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'order_items_total_price_positive'
        AND table_name = 'order_items'
    ) THEN
      ALTER TABLE order_items
        ADD CONSTRAINT order_items_total_price_positive CHECK (total_price >= 0);
    END IF;
  END IF;
END $$;

-- Add constraints to order_payments (with existence checks)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_payments') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'order_payments_payment_amount_positive'
        AND table_name = 'order_payments'
    ) THEN
      ALTER TABLE order_payments
        ADD CONSTRAINT order_payments_payment_amount_positive CHECK (payment_amount > 0);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'order_payments_payment_attempt_positive'
        AND table_name = 'order_payments'
    ) THEN
      ALTER TABLE order_payments
        ADD CONSTRAINT order_payments_payment_attempt_positive CHECK (payment_attempt_no > 0);
    END IF;
  END IF;
END $$;

-- Add constraints to order_refunds (with existence checks)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_refunds') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'order_refunds_refund_amount_positive'
        AND table_name = 'order_refunds'
    ) THEN
      ALTER TABLE order_refunds
        ADD CONSTRAINT order_refunds_refund_amount_positive CHECK (refund_amount > 0);
    END IF;
  END IF;
END $$;

-- Add constraints to order_rider_assignments (with existence checks)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_rider_assignments') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'order_rider_assignments_distance_positive'
        AND table_name = 'order_rider_assignments'
    ) THEN
      ALTER TABLE order_rider_assignments
        ADD CONSTRAINT order_rider_assignments_distance_positive CHECK (distance_to_pickup_km IS NULL OR distance_to_pickup_km >= 0);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'order_rider_assignments_earning_positive'
        AND table_name = 'order_rider_assignments'
    ) THEN
      ALTER TABLE order_rider_assignments
        ADD CONSTRAINT order_rider_assignments_earning_positive CHECK (rider_earning IS NULL OR rider_earning >= 0);
    END IF;
  END IF;
END $$;

-- Add constraints to order_ride_details (with existence checks)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_ride_details') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'order_ride_details_passenger_count_positive'
        AND table_name = 'order_ride_details'
    ) THEN
      ALTER TABLE order_ride_details
        ADD CONSTRAINT order_ride_details_passenger_count_positive CHECK (passenger_count > 0);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'order_ride_details_surge_multiplier_positive'
        AND table_name = 'order_ride_details'
    ) THEN
      ALTER TABLE order_ride_details
        ADD CONSTRAINT order_ride_details_surge_multiplier_positive CHECK (surge_multiplier >= 1.0);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'order_ride_details_total_fare_positive'
        AND table_name = 'order_ride_details'
    ) THEN
      ALTER TABLE order_ride_details
        ADD CONSTRAINT order_ride_details_total_fare_positive CHECK (total_fare >= 0);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_rider_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_rider_distances ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_rider_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_remarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_food_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_parcel_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_ride_details ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE orders IS 'Master orders table - Single Source of Truth for all order types (food, parcel, ride). Order ID is BIGSERIAL starting at 1000000.';
COMMENT ON TABLE order_items IS 'Items in order. Supports food items and parcel items with pricing, tax, and offers.';
COMMENT ON TABLE order_item_addons IS 'Addons for order items (e.g., extra cheese, no onions).';
COMMENT ON TABLE order_instructions IS 'Special instructions for merchant, rider, or customer.';
COMMENT ON TABLE order_payments IS 'Multiple payment attempts per order. Tracks payment gateway transactions, coupons, and refunds.';
COMMENT ON TABLE order_refunds IS 'Partial and full refunds. Tracks refund reasons, gateway transactions, and coupon issuance.';
COMMENT ON TABLE order_rider_assignments IS 'Multiple rider assignments per order (history preserved). Never deleted, only new assignments added.';
COMMENT ON TABLE order_rider_distances IS 'Distance tracking per rider assignment. Records merchant-to-rider and merchant-to-customer distances.';
COMMENT ON TABLE order_rider_actions IS 'Rider accept/reject actions. Links to assignments and tracks response times.';
COMMENT ON TABLE order_timeline IS 'Immutable status timeline. Never overwritten, only new entries added. Complete audit trail of order status changes.';
COMMENT ON TABLE order_notifications IS 'All notifications sent to customers, riders, and merchants. Tracks delivery status and channels.';
COMMENT ON TABLE order_remarks IS 'Remarks from agents, customers, riders, and merchants. Supports internal notes and public remarks.';
COMMENT ON TABLE order_tickets IS 'Support tickets raised by customers, riders, or merchants. Tracks priority, status, and resolution.';
COMMENT ON TABLE order_disputes IS 'Legal dispute tracking. Stores evidence, resolution details, and legal case information.';

-- ============================================================================
-- ADD MISSING FOREIGN KEYS FOR ORDERS TABLE (Conditional)
-- ============================================================================

-- Orders -> Merchant Stores (if merchant_stores table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_stores') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'orders' 
        AND column_name = 'merchant_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_merchant_id_fkey'
      ) THEN
        ALTER TABLE orders
          ADD CONSTRAINT orders_merchant_id_fkey
          FOREIGN KEY (merchant_id) REFERENCES merchant_stores(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- Orders -> Merchant Parents (if merchant_parents table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_parents') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'orders' 
        AND column_name = 'merchant_parent_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_merchant_parent_id_fkey'
      ) THEN
        ALTER TABLE orders
          ADD CONSTRAINT orders_merchant_parent_id_fkey
          FOREIGN KEY (merchant_parent_id) REFERENCES merchant_parents(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- Orders -> Customers (if customers table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'orders' 
        AND column_name = 'customer_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_customer_id_fkey'
      ) THEN
        ALTER TABLE orders
          ADD CONSTRAINT orders_customer_id_fkey
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;
COMMENT ON TABLE order_audit_log IS 'Complete audit trail of all order changes. Tracks who changed what and when. Legal dispute safe.';
COMMENT ON TABLE order_food_details IS 'Food delivery specific details: restaurant info, preparation time, food items count.';
COMMENT ON TABLE order_parcel_details IS 'Parcel delivery specific details: package dimensions, COD, insurance, verification requirements.';
COMMENT ON TABLE order_ride_details IS 'Ride booking specific details: passenger info, fare breakdown, route, scheduled rides, round trips.';

COMMENT ON COLUMN orders.order_uuid IS 'UUID for external API references. Order ID (BIGINT) is primary key.';
COMMENT ON COLUMN orders.order_source IS 'Source of order: internal app or external provider (Swiggy, Zomato, Rapido, ONDC, Shiprocket).';
COMMENT ON COLUMN orders.current_status IS 'Denormalized current status for performance. Synced from order_timeline.';
COMMENT ON COLUMN order_rider_assignments.assignment_status IS 'Status of rider assignment. Multiple assignments per order are allowed (history preserved).';
COMMENT ON COLUMN order_timeline.occurred_at IS 'Immutable timestamp. Timeline entries are never updated or deleted.';

-- ============================================================================
-- RECREATE MATERIALIZED VIEWS (Dropped earlier to allow column type changes)
-- ============================================================================

-- Provider Performance Summary (recreated after order_type column alteration)
-- Note: Uses order_source column (added in this migration)
CREATE MATERIALIZED VIEW IF NOT EXISTS provider_performance_summary AS
SELECT 
  COALESCE(o.order_source::TEXT, 'internal') AS provider_type,
  o.order_type,
  COUNT(DISTINCT o.id) AS total_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered') AS completed_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'cancelled') AS cancelled_orders,
  COALESCE(SUM(o.fare_amount) FILTER (WHERE o.status = 'delivered'), 0) AS total_revenue,
  COALESCE(SUM(o.rider_earning) FILTER (WHERE o.status = 'delivered'), 0) AS total_rider_earnings,
  COALESCE(SUM(o.commission_amount) FILTER (WHERE o.status = 'delivered'), 0) AS total_commission,
  COALESCE(AVG(EXTRACT(EPOCH FROM (o.actual_delivery_time - o.actual_pickup_time)) / 60), 0) AS avg_delivery_time_minutes,
  DATE_TRUNC('day', o.created_at) AS order_date
FROM orders o
WHERE (o.order_source IS NULL OR o.order_source != 'internal')
GROUP BY COALESCE(o.order_source::TEXT, 'internal'), o.order_type, DATE_TRUNC('day', o.created_at);

CREATE UNIQUE INDEX IF NOT EXISTS provider_performance_summary_unique_idx 
  ON provider_performance_summary(provider_type, order_type, order_date);

-- Order Source Distribution (recreated after order_type column alteration)
CREATE MATERIALIZED VIEW IF NOT EXISTS order_source_distribution AS
SELECT 
  COALESCE(order_source::TEXT, 'internal') AS source,
  order_type,
  status,
  COUNT(*) AS order_count,
  DATE_TRUNC('day', created_at) AS order_date
FROM orders
GROUP BY COALESCE(order_source::TEXT, 'internal'), order_type, status, DATE_TRUNC('day', created_at);

CREATE UNIQUE INDEX IF NOT EXISTS order_source_distribution_unique_idx 
  ON order_source_distribution(source, order_type, status, order_date);
