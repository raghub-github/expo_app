-- ============================================================================
-- UNIFIED ORDERS SERVICE-SPECIFIC DETAIL TABLES
-- Production-Grade Service-Specific Order Details
-- 1:1 relationships with orders table for food, parcel, and ride orders
-- Migration: unified_orders_service_details
-- Database: PostgreSQL
-- ORM: Drizzle
-- 
-- DESIGN PRINCIPLES:
-- - Service Separation: Service-specific details in separate tables
-- - 1:1 Relationship: One detail record per order (where applicable)
-- - Links to order_items: Service-specific items tracked in order_items table
-- ============================================================================

-- ============================================================================
-- ENSURE ENUMS EXIST
-- ============================================================================

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
-- ORDER FOOD DETAILS (Food Delivery Service)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_food_details (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL UNIQUE,
  
  -- Restaurant Information
  restaurant_id BIGINT, -- Reference to merchant_store_id
  restaurant_name TEXT,
  restaurant_phone TEXT,
  restaurant_address TEXT,
  
  -- Preparation Time Tracking
  preparation_time_minutes INTEGER,
  estimated_preparation_time TIMESTAMP WITH TIME ZONE,
  actual_preparation_time TIMESTAMP WITH TIME ZONE,
  
  -- Food Items Summary
  food_items_count INTEGER DEFAULT 0,
  food_items_total_value NUMERIC(12, 2) DEFAULT 0,
  
  -- Food Classification
  veg_non_veg veg_non_veg_type,
  
  -- Packaging Requirements
  requires_utensils BOOLEAN DEFAULT FALSE,
  requires_packaging BOOLEAN DEFAULT TRUE,
  
  -- Additional Metadata
  food_metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT order_food_details_order_id_unique UNIQUE (order_id)
);

-- Ensure columns exist and add foreign key constraints for order_food_details
DO $$
BEGIN
  -- Add order_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_food_details' 
      AND column_name = 'order_id'
  ) THEN
    ALTER TABLE public.order_food_details 
      ADD COLUMN order_id BIGINT NOT NULL;
  END IF;
  
  -- Add restaurant_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_food_details' 
      AND column_name = 'restaurant_id'
  ) THEN
    ALTER TABLE public.order_food_details 
      ADD COLUMN restaurant_id BIGINT;
  END IF;
  
  -- Add restaurant_name column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_food_details' 
      AND column_name = 'restaurant_name'
  ) THEN
    ALTER TABLE public.order_food_details 
      ADD COLUMN restaurant_name TEXT;
  END IF;
  
  -- Add restaurant_phone column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_food_details' 
      AND column_name = 'restaurant_phone'
  ) THEN
    ALTER TABLE public.order_food_details 
      ADD COLUMN restaurant_phone TEXT;
  END IF;
  
  -- Add restaurant_address column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_food_details' 
      AND column_name = 'restaurant_address'
  ) THEN
    ALTER TABLE public.order_food_details 
      ADD COLUMN restaurant_address TEXT;
  END IF;
  
  -- Add preparation_time_minutes column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_food_details' 
      AND column_name = 'preparation_time_minutes'
  ) THEN
    ALTER TABLE public.order_food_details 
      ADD COLUMN preparation_time_minutes INTEGER;
  END IF;
  
  -- Add estimated_preparation_time column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_food_details' 
      AND column_name = 'estimated_preparation_time'
  ) THEN
    ALTER TABLE public.order_food_details 
      ADD COLUMN estimated_preparation_time TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Add actual_preparation_time column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_food_details' 
      AND column_name = 'actual_preparation_time'
  ) THEN
    ALTER TABLE public.order_food_details 
      ADD COLUMN actual_preparation_time TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Add food_items_count column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_food_details' 
      AND column_name = 'food_items_count'
  ) THEN
    ALTER TABLE public.order_food_details 
      ADD COLUMN food_items_count INTEGER DEFAULT 0;
  END IF;
  
  -- Add food_items_total_value column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_food_details' 
      AND column_name = 'food_items_total_value'
  ) THEN
    ALTER TABLE public.order_food_details 
      ADD COLUMN food_items_total_value NUMERIC(12, 2) DEFAULT 0;
  END IF;
  
  -- Add veg_non_veg column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_food_details' 
      AND column_name = 'veg_non_veg'
  ) THEN
    ALTER TABLE public.order_food_details 
      ADD COLUMN veg_non_veg veg_non_veg_type;
  END IF;
  
  -- Add requires_utensils column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_food_details' 
      AND column_name = 'requires_utensils'
  ) THEN
    ALTER TABLE public.order_food_details 
      ADD COLUMN requires_utensils BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Add requires_packaging column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_food_details' 
      AND column_name = 'requires_packaging'
  ) THEN
    ALTER TABLE public.order_food_details 
      ADD COLUMN requires_packaging BOOLEAN DEFAULT TRUE;
  END IF;
  
  -- Add food_metadata column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_food_details' 
      AND column_name = 'food_metadata'
  ) THEN
    ALTER TABLE public.order_food_details 
      ADD COLUMN food_metadata JSONB DEFAULT '{}';
  END IF;
  
  -- Add created_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_food_details' 
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.order_food_details 
      ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
  
  -- Add updated_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_food_details' 
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.order_food_details 
      ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
  
  -- Add foreign key to orders table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'order_food_details' 
        AND column_name = 'order_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'order_food_details' 
          AND constraint_name = 'order_food_details_order_id_fkey'
      ) THEN
        ALTER TABLE public.order_food_details 
          ADD CONSTRAINT order_food_details_order_id_fkey 
          FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

-- Indexes for order_food_details
CREATE INDEX IF NOT EXISTS order_food_details_order_id_idx ON public.order_food_details(order_id);
CREATE INDEX IF NOT EXISTS order_food_details_restaurant_id_idx ON public.order_food_details(restaurant_id) WHERE restaurant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_food_details_veg_non_veg_idx ON public.order_food_details(veg_non_veg) WHERE veg_non_veg IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_food_details_preparation_time_idx ON public.order_food_details(preparation_time_minutes) WHERE preparation_time_minutes IS NOT NULL;

-- Comments
COMMENT ON TABLE public.order_food_details IS 'Food delivery specific details. One record per food order. Links to order_items with item_type=''food_item''.';
COMMENT ON COLUMN public.order_food_details.order_id IS 'Foreign key to orders table. Must have order_type=''food''.';
COMMENT ON COLUMN public.order_food_details.restaurant_id IS 'Reference to merchant_store_id for food orders.';
COMMENT ON COLUMN public.order_food_details.preparation_time_minutes IS 'Estimated kitchen preparation time in minutes.';
COMMENT ON COLUMN public.order_food_details.food_items_count IS 'Total number of food items in the order. Synced from order_items count.';
COMMENT ON COLUMN public.order_food_details.food_items_total_value IS 'Total value of all food items. Synced from order_items sum.';

-- ============================================================================
-- ORDER PARCEL DETAILS (Parcel Delivery Service)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_parcel_details (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL UNIQUE,
  
  -- Package Dimensions
  package_weight_kg NUMERIC(5, 2),
  package_length_cm NUMERIC(5, 2),
  package_width_cm NUMERIC(5, 2),
  package_height_cm NUMERIC(5, 2),
  package_volume_liters NUMERIC(5, 2), -- Calculated: length * width * height / 1000
  
  -- Package Value & Description
  package_value NUMERIC(12, 2),
  package_description TEXT,
  package_contents TEXT[], -- Array of contents
  
  -- Package Flags
  is_fragile BOOLEAN DEFAULT FALSE,
  is_hazardous BOOLEAN DEFAULT FALSE,
  requires_handling TEXT, -- 'careful', 'upright', 'temperature_controlled', 'refrigerated', etc.
  
  -- COD (Cash on Delivery)
  is_cod BOOLEAN DEFAULT FALSE,
  cod_amount NUMERIC(12, 2) DEFAULT 0,
  cod_collected BOOLEAN DEFAULT FALSE,
  cod_collected_at TIMESTAMP WITH TIME ZONE,
  
  -- Verification Requirements
  requires_signature BOOLEAN DEFAULT FALSE,
  requires_otp_verification BOOLEAN DEFAULT FALSE,
  requires_photo_proof BOOLEAN DEFAULT FALSE,
  delivery_proof_url TEXT,
  
  -- Insurance
  insurance_required BOOLEAN DEFAULT FALSE,
  insurance_amount NUMERIC(12, 2),
  insurance_provider TEXT,
  
  -- Scheduled Delivery
  scheduled_pickup_time TIMESTAMP WITH TIME ZONE,
  scheduled_delivery_time TIMESTAMP WITH TIME ZONE,
  
  -- Additional Metadata
  parcel_metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT order_parcel_details_order_id_unique UNIQUE (order_id),
  CONSTRAINT order_parcel_details_cod_amount_positive CHECK (cod_amount >= 0),
  CONSTRAINT order_parcel_details_package_weight_positive CHECK (package_weight_kg IS NULL OR package_weight_kg > 0),
  CONSTRAINT order_parcel_details_package_dimensions_positive CHECK (
    (package_length_cm IS NULL OR package_length_cm > 0) AND
    (package_width_cm IS NULL OR package_width_cm > 0) AND
    (package_height_cm IS NULL OR package_height_cm > 0)
  )
);

-- Ensure columns exist and add foreign key constraints for order_parcel_details
DO $$
BEGIN
  -- Add order_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_parcel_details' 
      AND column_name = 'order_id'
  ) THEN
    ALTER TABLE public.order_parcel_details 
      ADD COLUMN order_id BIGINT NOT NULL;
  END IF;
  
  -- Add all other columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'package_weight_kg') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN package_weight_kg NUMERIC(5, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'package_length_cm') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN package_length_cm NUMERIC(5, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'package_width_cm') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN package_width_cm NUMERIC(5, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'package_height_cm') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN package_height_cm NUMERIC(5, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'package_volume_liters') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN package_volume_liters NUMERIC(5, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'package_value') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN package_value NUMERIC(12, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'package_description') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN package_description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'package_contents') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN package_contents TEXT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'is_fragile') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN is_fragile BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'is_hazardous') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN is_hazardous BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'requires_handling') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN requires_handling TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'is_cod') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN is_cod BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'cod_amount') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN cod_amount NUMERIC(12, 2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'cod_collected') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN cod_collected BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'cod_collected_at') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN cod_collected_at TIMESTAMP WITH TIME ZONE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'requires_signature') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN requires_signature BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'requires_otp_verification') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN requires_otp_verification BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'requires_photo_proof') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN requires_photo_proof BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'delivery_proof_url') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN delivery_proof_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'insurance_required') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN insurance_required BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'insurance_amount') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN insurance_amount NUMERIC(12, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'insurance_provider') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN insurance_provider TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'scheduled_pickup_time') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN scheduled_pickup_time TIMESTAMP WITH TIME ZONE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'scheduled_delivery_time') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN scheduled_delivery_time TIMESTAMP WITH TIME ZONE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'parcel_metadata') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN parcel_metadata JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'created_at') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_parcel_details' AND column_name = 'updated_at') THEN
    ALTER TABLE public.order_parcel_details ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
  
  -- Add foreign key to orders table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'order_parcel_details' 
        AND column_name = 'order_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'order_parcel_details' 
          AND constraint_name = 'order_parcel_details_order_id_fkey'
      ) THEN
        ALTER TABLE public.order_parcel_details 
          ADD CONSTRAINT order_parcel_details_order_id_fkey 
          FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

-- Indexes for order_parcel_details
CREATE INDEX IF NOT EXISTS order_parcel_details_order_id_idx ON public.order_parcel_details(order_id);
CREATE INDEX IF NOT EXISTS order_parcel_details_is_cod_idx ON public.order_parcel_details(is_cod) WHERE is_cod = TRUE;
CREATE INDEX IF NOT EXISTS order_parcel_details_cod_collected_idx ON public.order_parcel_details(cod_collected) WHERE cod_collected = FALSE;
CREATE INDEX IF NOT EXISTS order_parcel_details_insurance_required_idx ON public.order_parcel_details(insurance_required) WHERE insurance_required = TRUE;
CREATE INDEX IF NOT EXISTS order_parcel_details_scheduled_pickup_idx ON public.order_parcel_details(scheduled_pickup_time) WHERE scheduled_pickup_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_parcel_details_scheduled_delivery_idx ON public.order_parcel_details(scheduled_delivery_time) WHERE scheduled_delivery_time IS NOT NULL;

-- Comments
COMMENT ON TABLE public.order_parcel_details IS 'Parcel delivery specific details. One record per parcel order. Links to order_items with item_type=''parcel''.';
COMMENT ON COLUMN public.order_parcel_details.order_id IS 'Foreign key to orders table. Must have order_type=''parcel''.';
COMMENT ON COLUMN public.order_parcel_details.package_volume_liters IS 'Calculated volume: (length * width * height) / 1000.';
COMMENT ON COLUMN public.order_parcel_details.is_cod IS 'Whether this is a Cash on Delivery order.';
COMMENT ON COLUMN public.order_parcel_details.cod_amount IS 'COD amount to be collected from customer.';
COMMENT ON COLUMN public.order_parcel_details.requires_handling IS 'Special handling requirements: careful, upright, temperature_controlled, refrigerated, etc.';

-- ============================================================================
-- ORDER RIDE DETAILS (Ride Booking Service)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_ride_details (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL UNIQUE,
  
  -- Passenger Details
  passenger_name TEXT,
  passenger_phone TEXT,
  passenger_email TEXT,
  passenger_count INTEGER DEFAULT 1 CHECK (passenger_count > 0),
  
  -- Ride Type
  ride_type TEXT, -- 'shared', 'private', 'premium', 'economy', 'luxury'
  vehicle_type_required TEXT, -- 'bike', 'car', 'auto', 'suv', 'van'
  
  -- Fare Breakdown
  base_fare NUMERIC(10, 2) DEFAULT 0,
  distance_fare NUMERIC(10, 2) DEFAULT 0,
  time_fare NUMERIC(10, 2) DEFAULT 0,
  surge_multiplier NUMERIC(3, 2) DEFAULT 1.0 CHECK (surge_multiplier >= 1.0),
  surge_amount NUMERIC(10, 2) DEFAULT 0,
  toll_charges NUMERIC(10, 2) DEFAULT 0,
  parking_charges NUMERIC(10, 2) DEFAULT 0,
  waiting_charges NUMERIC(10, 2) DEFAULT 0,
  night_charges NUMERIC(10, 2) DEFAULT 0,
  gst_amount NUMERIC(10, 2) DEFAULT 0,
  discount_amount NUMERIC(10, 2) DEFAULT 0,
  total_fare NUMERIC(12, 2) DEFAULT 0 CHECK (total_fare >= 0),
  
  -- Scheduled Ride
  scheduled_ride BOOLEAN DEFAULT FALSE,
  scheduled_pickup_time TIMESTAMP WITH TIME ZONE,
  
  -- Round Trip
  return_trip BOOLEAN DEFAULT FALSE,
  return_pickup_address TEXT,
  return_pickup_lat NUMERIC(10, 7),
  return_pickup_lon NUMERIC(10, 7),
  return_pickup_time TIMESTAMP WITH TIME ZONE,
  
  -- Route Information
  route_polyline TEXT, -- Encoded polyline string
  route_waypoints JSONB DEFAULT '[]', -- Array of waypoint objects
  estimated_route_distance_km NUMERIC(6, 2),
  actual_route_distance_km NUMERIC(6, 2),
  
  -- Additional Metadata
  ride_metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT order_ride_details_order_id_unique UNIQUE (order_id),
  CONSTRAINT order_ride_details_return_location_check CHECK (
    (return_trip = FALSE) OR 
    (return_trip = TRUE AND return_pickup_address IS NOT NULL AND return_pickup_lat IS NOT NULL AND return_pickup_lon IS NOT NULL)
  )
);

-- Ensure columns exist and add foreign key constraints for order_ride_details
DO $$
BEGIN
  -- Add order_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_ride_details' 
      AND column_name = 'order_id'
  ) THEN
    ALTER TABLE public.order_ride_details 
      ADD COLUMN order_id BIGINT NOT NULL;
  END IF;
  
  -- Add all other columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'passenger_name') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN passenger_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'passenger_phone') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN passenger_phone TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'passenger_email') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN passenger_email TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'passenger_count') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN passenger_count INTEGER DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'ride_type') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN ride_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'vehicle_type_required') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN vehicle_type_required TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'base_fare') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN base_fare NUMERIC(10, 2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'distance_fare') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN distance_fare NUMERIC(10, 2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'time_fare') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN time_fare NUMERIC(10, 2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'surge_multiplier') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN surge_multiplier NUMERIC(3, 2) DEFAULT 1.0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'surge_amount') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN surge_amount NUMERIC(10, 2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'toll_charges') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN toll_charges NUMERIC(10, 2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'parking_charges') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN parking_charges NUMERIC(10, 2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'waiting_charges') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN waiting_charges NUMERIC(10, 2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'night_charges') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN night_charges NUMERIC(10, 2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'gst_amount') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN gst_amount NUMERIC(10, 2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'discount_amount') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN discount_amount NUMERIC(10, 2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'total_fare') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN total_fare NUMERIC(12, 2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'scheduled_ride') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN scheduled_ride BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'scheduled_pickup_time') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN scheduled_pickup_time TIMESTAMP WITH TIME ZONE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'return_trip') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN return_trip BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'return_pickup_address') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN return_pickup_address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'return_pickup_lat') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN return_pickup_lat NUMERIC(10, 7);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'return_pickup_lon') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN return_pickup_lon NUMERIC(10, 7);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'return_pickup_time') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN return_pickup_time TIMESTAMP WITH TIME ZONE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'route_polyline') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN route_polyline TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'route_waypoints') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN route_waypoints JSONB DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'estimated_route_distance_km') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN estimated_route_distance_km NUMERIC(6, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'actual_route_distance_km') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN actual_route_distance_km NUMERIC(6, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'ride_metadata') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN ride_metadata JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'created_at') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_ride_details' AND column_name = 'updated_at') THEN
    ALTER TABLE public.order_ride_details ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
  
  -- Add foreign key to orders table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'order_ride_details' 
        AND column_name = 'order_id'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'order_ride_details' 
          AND constraint_name = 'order_ride_details_order_id_fkey'
      ) THEN
        ALTER TABLE public.order_ride_details 
          ADD CONSTRAINT order_ride_details_order_id_fkey 
          FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

-- Indexes for order_ride_details
CREATE INDEX IF NOT EXISTS order_ride_details_order_id_idx ON public.order_ride_details(order_id);
CREATE INDEX IF NOT EXISTS order_ride_details_scheduled_ride_idx ON public.order_ride_details(scheduled_ride) WHERE scheduled_ride = TRUE;
CREATE INDEX IF NOT EXISTS order_ride_details_scheduled_pickup_time_idx ON public.order_ride_details(scheduled_pickup_time) WHERE scheduled_pickup_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_ride_details_ride_type_idx ON public.order_ride_details(ride_type) WHERE ride_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_ride_details_vehicle_type_idx ON public.order_ride_details(vehicle_type_required) WHERE vehicle_type_required IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_ride_details_return_trip_idx ON public.order_ride_details(return_trip) WHERE return_trip = TRUE;

-- Comments
COMMENT ON TABLE public.order_ride_details IS 'Ride booking specific details. One record per ride order. Links to order_items with item_type=''passenger''.';
COMMENT ON COLUMN public.order_ride_details.order_id IS 'Foreign key to orders table. Must have order_type=''ride''.';
COMMENT ON COLUMN public.order_ride_details.ride_type IS 'Ride type: shared, private, premium, economy, luxury.';
COMMENT ON COLUMN public.order_ride_details.vehicle_type_required IS 'Required vehicle type: bike, car, auto, suv, van.';
COMMENT ON COLUMN public.order_ride_details.surge_multiplier IS 'Surge pricing multiplier. Default 1.0, increases during high demand.';
COMMENT ON COLUMN public.order_ride_details.route_polyline IS 'Encoded polyline string for route visualization.';
COMMENT ON COLUMN public.order_ride_details.route_waypoints IS 'JSON array of waypoint objects with lat, lon, address, order.';

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for service detail tables
DROP TRIGGER IF EXISTS order_food_details_updated_at_trigger ON public.order_food_details;
CREATE TRIGGER order_food_details_updated_at_trigger
  BEFORE UPDATE ON public.order_food_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS order_parcel_details_updated_at_trigger ON public.order_parcel_details;
CREATE TRIGGER order_parcel_details_updated_at_trigger
  BEFORE UPDATE ON public.order_parcel_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS order_ride_details_updated_at_trigger ON public.order_ride_details;
CREATE TRIGGER order_ride_details_updated_at_trigger
  BEFORE UPDATE ON public.order_ride_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.order_food_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_parcel_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_ride_details ENABLE ROW LEVEL SECURITY;
