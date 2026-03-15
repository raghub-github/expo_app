-- ============================================================================
-- Enhanced Orders Core and Food Orders Tables
-- Includes: Customer details, Rider details, Items details, Cancellation flow
-- ============================================================================

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS orders_food_otp_generate_trigger ON orders_food;

-- ============================================================================
-- 1. UPDATED ORDERS_CORE TABLE
-- ============================================================================

-- Add items column to orders_core if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders_core' AND column_name = 'items'
  ) THEN
    ALTER TABLE orders_core ADD COLUMN items JSONB NULL;
  END IF;
END $$;

-- Add cancelled_by_type to distinguish who cancelled (store, customer, system, rider)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders_core' AND column_name = 'cancelled_by_type'
  ) THEN
    ALTER TABLE orders_core ADD COLUMN cancelled_by_type TEXT NULL 
      CHECK (cancelled_by_type IS NULL OR cancelled_by_type IN ('store', 'customer', 'system', 'rider', 'admin'));
  END IF;
END $$;

-- Add cancellation_details JSONB for additional cancellation metadata
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders_core' AND column_name = 'cancellation_details'
  ) THEN
    ALTER TABLE orders_core ADD COLUMN cancellation_details JSONB NULL;
  END IF;
END $$;

-- Create index on items for JSONB queries
CREATE INDEX IF NOT EXISTS orders_core_items_idx ON orders_core USING GIN (items) WHERE items IS NOT NULL;

-- Create index on cancelled_by_type
CREATE INDEX IF NOT EXISTS orders_core_cancelled_by_type_idx ON orders_core (cancelled_by_type) WHERE cancelled_by_type IS NOT NULL;

-- ============================================================================
-- 2. UPDATED ORDERS_FOOD TABLE
-- ============================================================================

-- Drop and recreate orders_food table with enhanced columns
DROP TABLE IF EXISTS orders_food CASCADE;

CREATE TABLE public.orders_food (
  id BIGSERIAL NOT NULL,
  order_id BIGINT NOT NULL,
  merchant_store_id BIGINT NULL,
  merchant_parent_id BIGINT NULL,
  
  -- Restaurant Details
  restaurant_name TEXT NULL,
  restaurant_phone TEXT NULL,
  
  -- Preparation Details
  preparation_time_minutes INTEGER NULL,
  food_items_count INTEGER NULL,
  food_items_total_value NUMERIC(12, 2) NULL,
  
  -- Items Details (JSONB array of items)
  items JSONB NULL,
  
  -- Flags
  requires_utensils BOOLEAN NULL DEFAULT FALSE,
  is_fragile BOOLEAN NOT NULL DEFAULT FALSE,
  is_high_value BOOLEAN NOT NULL DEFAULT FALSE,
  veg_non_veg public.veg_non_veg_type NULL,
  
  -- Delivery Instructions
  delivery_instructions TEXT NULL,
  
  -- Customer Details (denormalized from orders_core -> customers)
  customer_id BIGINT NULL,
  customer_name TEXT NULL,
  customer_phone TEXT NULL,
  customer_email TEXT NULL,
  
  -- Rider Details (denormalized from orders_core -> riders)
  rider_id INTEGER NULL,
  rider_name TEXT NULL,
  rider_phone TEXT NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Status
  order_status TEXT NOT NULL DEFAULT 'CREATED'::TEXT,
  
  -- Status Timestamps
  accepted_at TIMESTAMP WITH TIME ZONE NULL,
  prepared_at TIMESTAMP WITH TIME ZONE NULL,
  dispatched_at TIMESTAMP WITH TIME ZONE NULL,
  delivered_at TIMESTAMP WITH TIME ZONE NULL,
  cancelled_at TIMESTAMP WITH TIME ZONE NULL,
  
  -- Cancellation Details
  rejected_reason TEXT NULL,
  cancelled_by TEXT NULL,
  cancelled_by_id BIGINT NULL,
  cancelled_by_type TEXT NULL CHECK (cancelled_by_type IS NULL OR cancelled_by_type IN ('store', 'customer', 'system', 'rider', 'admin')),
  cancellation_reason_id BIGINT NULL,
  cancellation_details JSONB NULL,
  
  -- RTO
  is_rto BOOLEAN NOT NULL DEFAULT FALSE,
  rto_at TIMESTAMP WITH TIME ZONE NULL,
  
  -- Constraints
  CONSTRAINT orders_food_pkey PRIMARY KEY (id),
  CONSTRAINT orders_food_order_id_key UNIQUE (order_id),
  CONSTRAINT orders_food_merchant_store_id_fkey FOREIGN KEY (merchant_store_id) 
    REFERENCES merchant_stores (id) ON DELETE SET NULL,
  CONSTRAINT orders_food_order_id_fkey FOREIGN KEY (order_id) 
    REFERENCES orders_core (id) ON DELETE CASCADE,
  CONSTRAINT orders_food_cancellation_reason_id_fkey FOREIGN KEY (cancellation_reason_id) 
    REFERENCES order_cancellation_reasons (id) ON DELETE SET NULL,
  CONSTRAINT orders_food_order_status_check CHECK (
    order_status = ANY (
      ARRAY[
        'CREATED'::TEXT,
        'ACCEPTED'::TEXT,
        'PREPARING'::TEXT,
        'READY_FOR_PICKUP'::TEXT,
        'OUT_FOR_DELIVERY'::TEXT,
        'DELIVERED'::TEXT,
        'RTO'::TEXT,
        'CANCELLED'::TEXT
      ]
    )
  )
) TABLESPACE pg_default;

-- Indexes
CREATE INDEX IF NOT EXISTS orders_food_order_id_idx ON public.orders_food USING BTREE (order_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS orders_food_merchant_store_id_idx ON public.orders_food USING BTREE (merchant_store_id) 
  WHERE (merchant_store_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS orders_food_order_status_idx ON public.orders_food USING BTREE (order_status);
CREATE INDEX IF NOT EXISTS orders_food_customer_id_idx ON public.orders_food USING BTREE (customer_id) 
  WHERE (customer_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS orders_food_rider_id_idx ON public.orders_food USING BTREE (rider_id) 
  WHERE (rider_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS orders_food_items_idx ON public.orders_food USING GIN (items) 
  WHERE (items IS NOT NULL);
CREATE INDEX IF NOT EXISTS orders_food_cancelled_at_idx ON public.orders_food USING BTREE (cancelled_at) 
  WHERE (cancelled_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS orders_food_created_at_idx ON public.orders_food USING BTREE (created_at DESC);

-- ============================================================================
-- 3. FUNCTION: Sync customer and rider details from orders_core
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_orders_food_customer_rider_details()
RETURNS TRIGGER AS $$
DECLARE
  v_customer_id BIGINT;
  v_customer_name TEXT;
  v_customer_phone TEXT;
  v_customer_email TEXT;
  v_rider_id INTEGER;
  v_rider_name TEXT;
  v_rider_phone TEXT;
BEGIN
  -- Fetch customer details from orders_core -> customers
  SELECT 
    oc.customer_id,
    c.full_name,
    c.primary_mobile,
    c.email
  INTO 
    v_customer_id,
    v_customer_name,
    v_customer_phone,
    v_customer_email
  FROM orders_core oc
  LEFT JOIN customers c ON c.id = oc.customer_id
  WHERE oc.id = NEW.order_id;
  
  -- Fetch rider details from orders_core -> riders
  SELECT 
    oc.rider_id,
    r.name,
    r.mobile
  INTO 
    v_rider_id,
    v_rider_name,
    v_rider_phone
  FROM orders_core oc
  LEFT JOIN riders r ON r.id = oc.rider_id
  WHERE oc.id = NEW.order_id;
  
  -- Update orders_food with denormalized data
  NEW.customer_id := v_customer_id;
  NEW.customer_name := v_customer_name;
  NEW.customer_phone := v_customer_phone;
  NEW.customer_email := v_customer_email;
  NEW.rider_id := v_rider_id;
  NEW.rider_name := v_rider_name;
  NEW.rider_phone := v_rider_phone;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to sync customer/rider details on INSERT/UPDATE
CREATE TRIGGER orders_food_sync_customer_rider_trigger
  BEFORE INSERT OR UPDATE ON orders_food
  FOR EACH ROW
  EXECUTE FUNCTION sync_orders_food_customer_rider_details();

-- ============================================================================
-- 4. FUNCTION: Handle cancellation flow (update orders_core first, then orders_food)
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_orders_food_cancellation()
RETURNS TRIGGER AS $$
DECLARE
  v_order_core_id BIGINT;
BEGIN
  -- Only process if status changed to CANCELLED
  IF NEW.order_status = 'CANCELLED' AND (OLD.order_status IS NULL OR OLD.order_status != 'CANCELLED') THEN
    v_order_core_id := NEW.order_id;
    
    -- Update orders_core with cancellation details
    UPDATE orders_core
    SET 
      cancelled_at = COALESCE(NEW.cancelled_at, NOW()),
      cancelled_by = NEW.cancelled_by,
      cancelled_by_id = NEW.cancelled_by_id,
      cancelled_by_type = COALESCE(NEW.cancelled_by_type, 'store'),
      cancellation_reason_id = NEW.cancellation_reason_id,
      cancellation_details = NEW.cancellation_details,
      status = 'cancelled'::order_status_type,
      current_status = 'CANCELLED',
      updated_at = NOW()
    WHERE id = v_order_core_id;
    
    -- Set cancelled_at if not set
    IF NEW.cancelled_at IS NULL THEN
      NEW.cancelled_at := NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for cancellation flow
CREATE TRIGGER orders_food_cancellation_trigger
  BEFORE INSERT OR UPDATE ON orders_food
  FOR EACH ROW
  EXECUTE FUNCTION handle_orders_food_cancellation();

-- ============================================================================
-- 5. FUNCTION: Sync items from orders_core to orders_food (if items exist in core)
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_orders_food_items()
RETURNS TRIGGER AS $$
DECLARE
  v_items JSONB;
BEGIN
  -- Fetch items from orders_core if not already set in orders_food
  IF NEW.items IS NULL THEN
    SELECT items INTO v_items
    FROM orders_core
    WHERE id = NEW.order_id;
    
    IF v_items IS NOT NULL THEN
      NEW.items := v_items;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to sync items
CREATE TRIGGER orders_food_sync_items_trigger
  BEFORE INSERT ON orders_food
  FOR EACH ROW
  EXECUTE FUNCTION sync_orders_food_items();

-- ============================================================================
-- 6. RE-CREATE OTP GENERATION TRIGGER
-- ============================================================================

CREATE TRIGGER orders_food_otp_generate_trigger
  AFTER INSERT ON orders_food
  FOR EACH ROW
  EXECUTE FUNCTION orders_food_otp_trigger();

-- ============================================================================
-- 7. DUMMY DATA: Ensure customers and riders exist
-- ============================================================================

-- Create dummy customers if they don't exist
INSERT INTO customers (
  customer_id,
  full_name,
  first_name,
  last_name,
  primary_mobile,
  email,
  account_status
) VALUES
  ('CUST-DUMMY-001', 'John Doe', 'John', 'Doe', '+919876543210', 'john.doe@example.com', 'ACTIVE'::customer_status),
  ('CUST-DUMMY-002', 'Jane Smith', 'Jane', 'Smith', '+919876543211', 'jane.smith@example.com', 'ACTIVE'::customer_status),
  ('CUST-DUMMY-003', 'Bob Johnson', 'Bob', 'Johnson', '+919876543212', 'bob.johnson@example.com', 'ACTIVE'::customer_status)
ON CONFLICT (customer_id) DO NOTHING;

-- Create dummy riders if they don't exist
INSERT INTO riders (
  mobile,
  name,
  status,
  onboarding_stage,
  kyc_status
) VALUES
  ('+919876543220', 'Rider One', 'ACTIVE'::rider_status, 'ACTIVE'::onboarding_stage, 'APPROVED'::kyc_status),
  ('+919876543221', 'Rider Two', 'ACTIVE'::rider_status, 'ACTIVE'::onboarding_stage, 'APPROVED'::kyc_status)
ON CONFLICT (mobile) DO NOTHING;

-- ============================================================================
-- 8. DUMMY DATA FOR ORDERS_CORE
-- ============================================================================

-- Insert dummy orders_core records
INSERT INTO orders_core (
  order_type,
  order_source,
  customer_id,
  merchant_store_id,
  pickup_address_raw,
  pickup_lat,
  pickup_lon,
  drop_address_raw,
  drop_lat,
  drop_lon,
  distance_km,
  fare_amount,
  commission_amount,
  rider_earning,
  status,
  current_status,
  payment_status,
  payment_method,
  rider_id,
  items,
  created_at
) VALUES
-- Order 1: Active order with items
(
  'food'::order_type,
  'internal'::order_source_type,
  (SELECT id FROM customers WHERE customer_id = 'CUST-DUMMY-001' LIMIT 1),
  (SELECT id FROM merchant_stores LIMIT 1),
  '123 Restaurant Street, City',
  28.6139,
  77.2090,
  '456 Customer Avenue, City',
  28.7041,
  77.1025,
  5.2,
  150.00,
  15.00,
  135.00,
  'assigned'::order_status_type,
  'READY_FOR_PICKUP',
  'pending'::payment_status_type,
  'online'::payment_mode_type,
  (SELECT id FROM riders WHERE mobile = '+919876543220' LIMIT 1),
  '[
    {
      "id": 1,
      "name": "Margherita Pizza",
      "quantity": 2,
      "price": 250.00,
      "total": 500.00,
      "category": "Pizza",
      "customizations": ["Extra Cheese"]
    },
    {
      "id": 2,
      "name": "Garlic Bread",
      "quantity": 1,
      "price": 80.00,
      "total": 80.00,
      "category": "Appetizer"
    }
  ]'::JSONB,
  NOW() - INTERVAL '2 hours'
),
-- Order 2: Dispatched order
(
  'food'::order_type,
  'internal'::order_source_type,
  (SELECT id FROM customers WHERE customer_id = 'CUST-DUMMY-002' LIMIT 1),
  (SELECT id FROM merchant_stores LIMIT 1),
  '789 Restaurant Lane, City',
  28.6139,
  77.2090,
  '321 Customer Road, City',
  28.7041,
  77.1025,
  3.8,
  120.00,
  12.00,
  108.00,
  'in_transit'::order_status_type,
  'OUT_FOR_DELIVERY',
  'completed'::payment_status_type,
  'online'::payment_mode_type,
  (SELECT id FROM riders WHERE mobile = '+919876543221' LIMIT 1),
  '[
    {
      "id": 3,
      "name": "Chicken Biryani",
      "quantity": 1,
      "price": 180.00,
      "total": 180.00,
      "category": "Main Course",
      "spice_level": "Medium"
    }
  ]'::JSONB,
  NOW() - INTERVAL '1 hour'
),
-- Order 3: Cancelled order (by store)
(
  'food'::order_type,
  'internal'::order_source_type,
  (SELECT id FROM customers WHERE customer_id = 'CUST-DUMMY-003' LIMIT 1),
  (SELECT id FROM merchant_stores LIMIT 1),
  '555 Restaurant Blvd, City',
  28.6139,
  77.2090,
  '999 Customer Street, City',
  28.7041,
  77.1025,
  4.5,
  200.00,
  20.00,
  180.00,
  'cancelled'::order_status_type,
  'CANCELLED',
  'refunded'::payment_status_type,
  'online'::payment_mode_type,
  NULL,
  '[
    {
      "id": 4,
      "name": "Veg Thali",
      "quantity": 2,
      "price": 150.00,
      "total": 300.00,
      "category": "Thali"
    }
  ]'::JSONB,
  NOW() - INTERVAL '3 hours'
)
ON CONFLICT DO NOTHING;

-- Update cancelled order with cancellation details
UPDATE orders_core
SET 
  cancelled_at = NOW() - INTERVAL '2 hours',
  cancelled_by = 'store',
  cancelled_by_type = 'store',
  cancellation_details = '{"reason": "Item unavailable", "initiated_by": "merchant_portal"}'::JSONB
WHERE id = (
  SELECT id FROM orders_core 
  WHERE status = 'cancelled'::order_status_type
    AND cancelled_at IS NULL
  LIMIT 1
);

-- ============================================================================
-- 9. DUMMY DATA FOR ORDERS_FOOD
-- ============================================================================

-- Insert dummy orders_food records
-- Note: customer/rider details will be auto-populated by trigger from orders_core
-- Column order matches table definition exactly
INSERT INTO orders_food (
  order_id,
  merchant_store_id,
  merchant_parent_id,
  restaurant_name,
  restaurant_phone,
  preparation_time_minutes,
  food_items_count,
  food_items_total_value,
  items,
  requires_utensils,
  is_fragile,
  is_high_value,
  veg_non_veg,
  delivery_instructions,
  customer_id,
  customer_name,
  customer_phone,
  customer_email,
  rider_id,
  rider_name,
  rider_phone,
  created_at,
  updated_at,
  order_status,
  accepted_at,
  prepared_at,
  dispatched_at,
  delivered_at,
  cancelled_at,
  rejected_reason,
  cancelled_by,
  cancelled_by_id,
  cancelled_by_type,
  cancellation_reason_id,
  cancellation_details,
  is_rto,
  rto_at
) VALUES
-- Order 1: Ready for pickup
(
  (SELECT id FROM orders_core WHERE current_status = 'READY_FOR_PICKUP' LIMIT 1),
  (SELECT merchant_store_id FROM orders_core WHERE current_status = 'READY_FOR_PICKUP' LIMIT 1),
  NULL,
  'Dummy Restaurant 1',
  '+919876543210',
  25,
  2,
  580.00,
  '[
    {
      "id": 1,
      "name": "Margherita Pizza",
      "quantity": 2,
      "price": 250.00,
      "total": 500.00,
      "category": "Pizza",
      "customizations": ["Extra Cheese"]
    },
    {
      "id": 2,
      "name": "Garlic Bread",
      "quantity": 1,
      "price": 80.00,
      "total": 80.00,
      "category": "Appetizer"
    }
  ]'::JSONB,
  TRUE,
  FALSE,
  FALSE,
  'veg'::veg_non_veg_type,
  'Leave at door',
  NULL, -- customer_id (will be synced by trigger)
  NULL, -- customer_name (will be synced by trigger)
  NULL, -- customer_phone (will be synced by trigger)
  NULL, -- customer_email (will be synced by trigger)
  NULL, -- rider_id (will be synced by trigger)
  NULL, -- rider_name (will be synced by trigger)
  NULL, -- rider_phone (will be synced by trigger)
  NOW() - INTERVAL '2 hours', -- created_at
  NOW() - INTERVAL '2 hours', -- updated_at
  'READY_FOR_PICKUP', -- order_status
  NOW() - INTERVAL '1 hour 30 minutes', -- accepted_at
  NOW() - INTERVAL '1 hour', -- prepared_at
  NULL, -- dispatched_at
  NULL, -- delivered_at
  NULL, -- cancelled_at
  NULL, -- rejected_reason
  NULL, -- cancelled_by
  NULL, -- cancelled_by_id
  NULL, -- cancelled_by_type
  NULL, -- cancellation_reason_id
  NULL, -- cancellation_details
  FALSE, -- is_rto
  NULL -- rto_at
),
-- Order 2: Out for delivery
(
  (SELECT id FROM orders_core WHERE current_status = 'OUT_FOR_DELIVERY' LIMIT 1),
  (SELECT merchant_store_id FROM orders_core WHERE current_status = 'OUT_FOR_DELIVERY' LIMIT 1),
  NULL,
  'Dummy Restaurant 2',
  '+919876543211',
  20,
  1,
  180.00,
  '[
    {
      "id": 3,
      "name": "Chicken Biryani",
      "quantity": 1,
      "price": 180.00,
      "total": 180.00,
      "category": "Main Course",
      "spice_level": "Medium"
    }
  ]'::JSONB,
  TRUE,
  FALSE,
  FALSE,
  'non_veg'::veg_non_veg_type,
  'Call before delivery',
  NULL, -- customer_id (will be synced by trigger)
  NULL, -- customer_name (will be synced by trigger)
  NULL, -- customer_phone (will be synced by trigger)
  NULL, -- customer_email (will be synced by trigger)
  NULL, -- rider_id (will be synced by trigger)
  NULL, -- rider_name (will be synced by trigger)
  NULL, -- rider_phone (will be synced by trigger)
  NOW() - INTERVAL '1 hour', -- created_at
  NOW() - INTERVAL '1 hour', -- updated_at
  'OUT_FOR_DELIVERY', -- order_status
  NOW() - INTERVAL '50 minutes', -- accepted_at
  NOW() - INTERVAL '40 minutes', -- prepared_at
  NOW() - INTERVAL '30 minutes', -- dispatched_at
  NULL, -- delivered_at
  NULL, -- cancelled_at
  NULL, -- rejected_reason
  NULL, -- cancelled_by
  NULL, -- cancelled_by_id
  NULL, -- cancelled_by_type
  NULL, -- cancellation_reason_id
  NULL, -- cancellation_details
  FALSE, -- is_rto
  NULL -- rto_at
),
-- Order 3: Cancelled by store
(
  (SELECT id FROM orders_core WHERE status = 'cancelled'::order_status_type LIMIT 1),
  (SELECT merchant_store_id FROM orders_core WHERE status = 'cancelled'::order_status_type LIMIT 1),
  NULL,
  'Dummy Restaurant 3',
  '+919876543212',
  NULL,
  2,
  300.00,
  '[
    {
      "id": 4,
      "name": "Veg Thali",
      "quantity": 2,
      "price": 150.00,
      "total": 300.00,
      "category": "Thali"
    }
  ]'::JSONB,
  TRUE,
  FALSE,
  FALSE,
  'veg'::veg_non_veg_type,
  NULL,
  NULL, -- customer_id (will be synced by trigger)
  NULL, -- customer_name (will be synced by trigger)
  NULL, -- customer_phone (will be synced by trigger)
  NULL, -- customer_email (will be synced by trigger)
  NULL, -- rider_id (will be synced by trigger)
  NULL, -- rider_name (will be synced by trigger)
  NULL, -- rider_phone (will be synced by trigger)
  NOW() - INTERVAL '3 hours', -- created_at
  NOW() - INTERVAL '3 hours', -- updated_at
  'CANCELLED', -- order_status
  NOW() - INTERVAL '2 hours 30 minutes', -- accepted_at
  NULL, -- prepared_at
  NULL, -- dispatched_at
  NULL, -- delivered_at
  NOW() - INTERVAL '2 hours', -- cancelled_at
  'Item unavailable - Out of stock', -- rejected_reason
  'store', -- cancelled_by
  NULL, -- cancelled_by_id
  'store', -- cancelled_by_type
  NULL, -- cancellation_reason_id
  jsonb_build_object(
    'reason', 'Item unavailable',
    'initiated_by', 'merchant_portal',
    'store_id', (SELECT merchant_store_id FROM orders_core WHERE status = 'cancelled'::order_status_type LIMIT 1)
  ), -- cancellation_details
  FALSE, -- is_rto
  NULL -- rto_at
)
ON CONFLICT (order_id) DO NOTHING;

-- ============================================================================
-- 10. UPDATE EXISTING ORDERS_FOOD RECORDS (if any) with customer/rider details
-- ============================================================================

-- This will be handled by the trigger on next UPDATE, but we can manually sync:
UPDATE orders_food of
SET 
  customer_id = oc.customer_id,
  customer_name = c.full_name,
  customer_phone = c.primary_mobile,
  customer_email = c.email,
  rider_id = oc.rider_id,
  rider_name = r.name,
  rider_phone = r.mobile,
  items = COALESCE(of.items, oc.items)
FROM orders_core oc
LEFT JOIN customers c ON c.id = oc.customer_id
LEFT JOIN riders r ON r.id = oc.rider_id
WHERE of.order_id = oc.id
  AND (of.customer_id IS NULL OR of.rider_id IS NULL OR of.items IS NULL);

-- ============================================================================
-- END
-- ============================================================================
