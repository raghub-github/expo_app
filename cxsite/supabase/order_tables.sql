-- =============================================
-- GatiMitra Order Tables Schema
-- =============================================
-- This file creates the 3 separate order tables:
-- 1. food_orders - For food delivery orders
-- 2. person_orders - For ride/person transport orders
-- 3. parcel_orders - For parcel/courier delivery orders
-- =============================================

-- =============================================
-- FOOD ORDERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.food_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  user_phone TEXT NOT NULL,
  user_name TEXT,
  
  -- Restaurant Details
  restaurant_id TEXT NOT NULL,
  restaurant_name TEXT NOT NULL,
  
  -- Order Items (JSON array)
  items JSONB NOT NULL DEFAULT '[]',
  
  -- Pricing
  subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
  delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  taxes DECIMAL(10, 2) NOT NULL DEFAULT 0,
  discount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Delivery Details
  delivery_address JSONB NOT NULL,
  delivery_instructions TEXT,
  
  -- Payment
  payment_method TEXT NOT NULL DEFAULT 'cod',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  
  -- Order Status
  status TEXT NOT NULL DEFAULT 'placed',
  status_history JSONB DEFAULT '[]',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  estimated_delivery_time TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  
  -- Tracking
  delivery_partner_id TEXT,
  delivery_partner_name TEXT,
  delivery_partner_phone TEXT,
  tracking_url TEXT
);

-- Create indexes for food_orders
CREATE INDEX IF NOT EXISTS idx_food_orders_user_id ON public.food_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_food_orders_user_phone ON public.food_orders(user_phone);
CREATE INDEX IF NOT EXISTS idx_food_orders_status ON public.food_orders(status);
CREATE INDEX IF NOT EXISTS idx_food_orders_created_at ON public.food_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_food_orders_restaurant_id ON public.food_orders(restaurant_id);

-- =============================================
-- PERSON ORDERS TABLE (Ride/Transport)
-- =============================================
CREATE TABLE IF NOT EXISTS public.person_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  user_phone TEXT NOT NULL,
  user_name TEXT,
  
  -- Ride Details
  ride_type TEXT NOT NULL DEFAULT 'go',
  passengers INTEGER NOT NULL DEFAULT 1,
  
  -- Locations
  pickup_location JSONB NOT NULL,
  dropoff_location JSONB NOT NULL,
  distance_km DECIMAL(10, 2),
  estimated_duration_mins INTEGER,
  
  -- Pricing
  base_fare DECIMAL(10, 2) NOT NULL DEFAULT 0,
  distance_fare DECIMAL(10, 2) NOT NULL DEFAULT 0,
  time_fare DECIMAL(10, 2) NOT NULL DEFAULT 0,
  surge_multiplier DECIMAL(3, 2) DEFAULT 1.00,
  discount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Scheduling
  is_scheduled BOOLEAN DEFAULT FALSE,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  
  -- Payment
  payment_method TEXT NOT NULL DEFAULT 'cod',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  
  -- Order Status
  status TEXT NOT NULL DEFAULT 'searching',
  status_history JSONB DEFAULT '[]',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  pickup_time TIMESTAMP WITH TIME ZONE,
  dropoff_time TIMESTAMP WITH TIME ZONE,
  
  -- Driver Details
  driver_id TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  driver_photo TEXT,
  vehicle_number TEXT,
  vehicle_model TEXT,
  driver_rating DECIMAL(2, 1),
  
  -- Rating & Feedback
  user_rating INTEGER,
  user_feedback TEXT
);

-- Create indexes for person_orders
CREATE INDEX IF NOT EXISTS idx_person_orders_user_id ON public.person_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_person_orders_user_phone ON public.person_orders(user_phone);
CREATE INDEX IF NOT EXISTS idx_person_orders_status ON public.person_orders(status);
CREATE INDEX IF NOT EXISTS idx_person_orders_created_at ON public.person_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_person_orders_driver_id ON public.person_orders(driver_id);

-- =============================================
-- PARCEL ORDERS TABLE (Courier/Delivery)
-- =============================================
CREATE TABLE IF NOT EXISTS public.parcel_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  user_phone TEXT NOT NULL,
  user_name TEXT,
  
  -- Parcel Details
  parcel_type TEXT NOT NULL DEFAULT 'documents',
  weight_range TEXT,
  description TEXT,
  is_fragile BOOLEAN DEFAULT FALSE,
  
  -- Locations
  pickup_location JSONB NOT NULL,
  dropoff_location JSONB NOT NULL,
  distance_km DECIMAL(10, 2),
  
  -- Receiver Details
  receiver_name TEXT NOT NULL,
  receiver_phone TEXT NOT NULL,
  
  -- Pricing
  base_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  weight_charge DECIMAL(10, 2) NOT NULL DEFAULT 0,
  distance_charge DECIMAL(10, 2) NOT NULL DEFAULT 0,
  insurance_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  discount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Scheduling
  is_scheduled BOOLEAN DEFAULT FALSE,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  
  -- Payment
  payment_method TEXT NOT NULL DEFAULT 'cod',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  
  -- Order Status
  status TEXT NOT NULL DEFAULT 'placed',
  status_history JSONB DEFAULT '[]',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  picked_up_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  estimated_delivery_time TIMESTAMP WITH TIME ZONE,
  
  -- Delivery Partner Details
  delivery_partner_id TEXT,
  delivery_partner_name TEXT,
  delivery_partner_phone TEXT,
  delivery_partner_photo TEXT,
  
  -- Tracking
  tracking_number TEXT,
  current_location JSONB,
  
  -- Proof of Delivery
  delivery_proof_image TEXT,
  receiver_signature TEXT,
  
  -- Rating & Feedback
  user_rating INTEGER,
  user_feedback TEXT
);

-- Create indexes for parcel_orders
CREATE INDEX IF NOT EXISTS idx_parcel_orders_user_id ON public.parcel_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_parcel_orders_user_phone ON public.parcel_orders(user_phone);
CREATE INDEX IF NOT EXISTS idx_parcel_orders_status ON public.parcel_orders(status);
CREATE INDEX IF NOT EXISTS idx_parcel_orders_created_at ON public.parcel_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parcel_orders_tracking_number ON public.parcel_orders(tracking_number);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.food_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcel_orders ENABLE ROW LEVEL SECURITY;

-- Policies for food_orders
CREATE POLICY "Users can view their own food orders" ON public.food_orders
  FOR SELECT USING (true);

CREATE POLICY "Users can insert food orders" ON public.food_orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own food orders" ON public.food_orders
  FOR UPDATE USING (true);

-- Policies for person_orders
CREATE POLICY "Users can view their own person orders" ON public.person_orders
  FOR SELECT USING (true);

CREATE POLICY "Users can insert person orders" ON public.person_orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own person orders" ON public.person_orders
  FOR UPDATE USING (true);

-- Policies for parcel_orders
CREATE POLICY "Users can view their own parcel orders" ON public.parcel_orders
  FOR SELECT USING (true);

CREATE POLICY "Users can insert parcel orders" ON public.parcel_orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own parcel orders" ON public.parcel_orders
  FOR UPDATE USING (true);

-- =============================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================

-- Create or replace function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for food_orders
DROP TRIGGER IF EXISTS update_food_orders_updated_at ON public.food_orders;
CREATE TRIGGER update_food_orders_updated_at
  BEFORE UPDATE ON public.food_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for person_orders
DROP TRIGGER IF EXISTS update_person_orders_updated_at ON public.person_orders;
CREATE TRIGGER update_person_orders_updated_at
  BEFORE UPDATE ON public.person_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for parcel_orders
DROP TRIGGER IF EXISTS update_parcel_orders_updated_at ON public.parcel_orders;
CREATE TRIGGER update_parcel_orders_updated_at
  BEFORE UPDATE ON public.parcel_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON TABLE public.food_orders IS 'Stores all food delivery orders from restaurants';
COMMENT ON TABLE public.person_orders IS 'Stores all ride/person transport orders';
COMMENT ON TABLE public.parcel_orders IS 'Stores all parcel/courier delivery orders';
