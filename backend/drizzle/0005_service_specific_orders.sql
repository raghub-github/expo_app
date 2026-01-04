-- Service-Specific Order Enhancements
-- Adds proper support for Food Delivery, Parcel Delivery, and Ride Booking
-- Migration: 0005_service_specific_orders
-- Database: Supabase PostgreSQL

-- ============================================================================
-- ENHANCE ORDERS TABLE WITH SERVICE-SPECIFIC FIELDS
-- ============================================================================

-- Add common fields needed for all service types
ALTER TABLE orders
  -- Food Delivery specific
  ADD COLUMN IF NOT EXISTS restaurant_name TEXT,
  ADD COLUMN IF NOT EXISTS restaurant_phone TEXT,
  ADD COLUMN IF NOT EXISTS preparation_time_minutes INTEGER, -- Estimated prep time
  ADD COLUMN IF NOT EXISTS food_items_count INTEGER, -- Number of items
  ADD COLUMN IF NOT EXISTS food_items_total_value NUMERIC(10, 2), -- Total order value
  ADD COLUMN IF NOT EXISTS requires_utensils BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivery_instructions TEXT, -- Special delivery instructions
  
  -- Parcel Delivery specific
  ADD COLUMN IF NOT EXISTS package_weight_kg NUMERIC(5, 2), -- Package weight
  ADD COLUMN IF NOT EXISTS package_length_cm NUMERIC(5, 2), -- Package dimensions
  ADD COLUMN IF NOT EXISTS package_width_cm NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS package_height_cm NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS package_value NUMERIC(10, 2), -- Declared value for insurance
  ADD COLUMN IF NOT EXISTS is_fragile BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_cod BOOLEAN DEFAULT FALSE, -- Cash on delivery
  ADD COLUMN IF NOT EXISTS cod_amount NUMERIC(10, 2), -- COD amount to collect
  ADD COLUMN IF NOT EXISTS requires_signature BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_otp_verification BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS insurance_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS insurance_amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS package_description TEXT, -- What's inside
  
  -- Ride Booking specific
  ADD COLUMN IF NOT EXISTS passenger_name TEXT,
  ADD COLUMN IF NOT EXISTS passenger_phone TEXT,
  ADD COLUMN IF NOT EXISTS passenger_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ride_type TEXT, -- 'shared', 'private', 'premium', 'economy'
  ADD COLUMN IF NOT EXISTS vehicle_type_required TEXT, -- 'bike', 'car', 'auto', 'suv'
  ADD COLUMN IF NOT EXISTS base_fare NUMERIC(10, 2), -- Base fare
  ADD COLUMN IF NOT EXISTS distance_fare NUMERIC(10, 2), -- Distance-based fare
  ADD COLUMN IF NOT EXISTS time_fare NUMERIC(10, 2), -- Time-based fare
  ADD COLUMN IF NOT EXISTS surge_multiplier NUMERIC(3, 2) DEFAULT 1.0, -- Surge pricing
  ADD COLUMN IF NOT EXISTS toll_charges NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parking_charges NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waiting_charges NUMERIC(10, 2) DEFAULT 0, -- If passenger is late
  ADD COLUMN IF NOT EXISTS scheduled_ride BOOLEAN DEFAULT FALSE, -- Is it a scheduled ride?
  ADD COLUMN IF NOT EXISTS scheduled_pickup_time TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS return_trip BOOLEAN DEFAULT FALSE, -- Round trip
  ADD COLUMN IF NOT EXISTS return_pickup_address TEXT,
  ADD COLUMN IF NOT EXISTS return_pickup_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS return_pickup_lon DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS return_pickup_time TIMESTAMP WITH TIME ZONE,
  
  -- Common enhanced fields
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  ADD COLUMN IF NOT EXISTS special_requirements TEXT[], -- Array of special requirements
  ADD COLUMN IF NOT EXISTS contact_person_name TEXT, -- Person to contact at pickup/drop
  ADD COLUMN IF NOT EXISTS contact_person_phone TEXT,
  ADD COLUMN IF NOT EXISTS estimated_pickup_time TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS estimated_delivery_time TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS actual_pickup_time TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS actual_delivery_time TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS delivery_proof_url TEXT, -- Photo/signature proof
  ADD COLUMN IF NOT EXISTS delivery_proof_type TEXT, -- 'photo', 'signature', 'otp', 'none'
  ADD COLUMN IF NOT EXISTS customer_rating SMALLINT, -- 1-5
  ADD COLUMN IF NOT EXISTS customer_feedback TEXT;

-- Create indexes for service-specific queries
CREATE INDEX IF NOT EXISTS orders_restaurant_name_idx ON orders(restaurant_name) WHERE restaurant_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_is_cod_idx ON orders(is_cod) WHERE is_cod = TRUE;
CREATE INDEX IF NOT EXISTS orders_cod_amount_idx ON orders(cod_amount) WHERE cod_amount IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_ride_type_idx ON orders(ride_type) WHERE ride_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_vehicle_type_required_idx ON orders(vehicle_type_required) WHERE vehicle_type_required IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_scheduled_ride_idx ON orders(scheduled_ride) WHERE scheduled_ride = TRUE;
CREATE INDEX IF NOT EXISTS orders_scheduled_pickup_time_idx ON orders(scheduled_pickup_time) WHERE scheduled_pickup_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_priority_idx ON orders(priority);
CREATE INDEX IF NOT EXISTS orders_estimated_pickup_time_idx ON orders(estimated_pickup_time) WHERE estimated_pickup_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_estimated_delivery_time_idx ON orders(estimated_delivery_time) WHERE estimated_delivery_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_order_type_priority_idx ON orders(order_type, priority);

-- ============================================================================
-- FOOD DELIVERY SPECIFIC TABLES
-- ============================================================================

-- Food Items in Order
CREATE TABLE IF NOT EXISTS order_food_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10, 2) NOT NULL,
  total_price NUMERIC(10, 2) NOT NULL,
  special_instructions TEXT, -- e.g., "no onions", "extra spicy"
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_food_items_order_id_idx ON order_food_items(order_id);
CREATE INDEX IF NOT EXISTS order_food_items_order_id_created_idx ON order_food_items(order_id, created_at);

-- Food Order Status Tracking
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'food_order_status') THEN
    CREATE TYPE food_order_status AS ENUM (
      'placed',
      'confirmed',
      'preparing',
      'ready_for_pickup',
      'picked_up',
      'out_for_delivery',
      'delivered',
      'cancelled'
    );
  END IF;
END $$;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS food_order_status food_order_status;

CREATE INDEX IF NOT EXISTS orders_food_order_status_idx ON orders(food_order_status) WHERE food_order_status IS NOT NULL;

-- ============================================================================
-- PARCEL DELIVERY SPECIFIC TABLES
-- ============================================================================

-- Parcel Tracking Events
CREATE TABLE IF NOT EXISTS parcel_tracking_events (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'picked_up', 'in_transit', 'out_for_delivery', 'delivery_attempted', 'delivered', 'returned'
  location TEXT, -- Current location
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  status_description TEXT,
  handled_by TEXT, -- 'rider', 'warehouse', 'customer', 'merchant'
  proof_url TEXT, -- Photo/signature proof
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS parcel_tracking_events_order_id_idx ON parcel_tracking_events(order_id);
CREATE INDEX IF NOT EXISTS parcel_tracking_events_event_type_idx ON parcel_tracking_events(event_type);
CREATE INDEX IF NOT EXISTS parcel_tracking_events_created_at_idx ON parcel_tracking_events(created_at);
CREATE INDEX IF NOT EXISTS parcel_tracking_events_order_created_idx ON parcel_tracking_events(order_id, created_at);

-- COD Collection Tracking
CREATE TABLE IF NOT EXISTS cod_collections (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  collected_by INTEGER NOT NULL REFERENCES riders(id),
  collection_method TEXT DEFAULT 'cash', -- 'cash', 'upi', 'card'
  transaction_id TEXT, -- For digital payments
  receipt_url TEXT, -- Receipt/proof
  deposited_to_bank BOOLEAN DEFAULT FALSE,
  deposited_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cod_collections_order_id_idx ON cod_collections(order_id);
CREATE INDEX IF NOT EXISTS cod_collections_collected_by_idx ON cod_collections(collected_by);
CREATE INDEX IF NOT EXISTS cod_collections_collected_at_idx ON cod_collections(collected_at);
CREATE INDEX IF NOT EXISTS cod_collections_deposited_to_bank_idx ON cod_collections(deposited_to_bank) WHERE deposited_to_bank = FALSE;

-- ============================================================================
-- RIDE BOOKING SPECIFIC TABLES
-- ============================================================================

-- Ride Fare Breakdown
CREATE TABLE IF NOT EXISTS ride_fare_breakdown (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  base_fare NUMERIC(10, 2) NOT NULL,
  distance_fare NUMERIC(10, 2) DEFAULT 0,
  time_fare NUMERIC(10, 2) DEFAULT 0,
  surge_multiplier NUMERIC(3, 2) DEFAULT 1.0,
  surge_amount NUMERIC(10, 2) DEFAULT 0,
  toll_charges NUMERIC(10, 2) DEFAULT 0,
  parking_charges NUMERIC(10, 2) DEFAULT 0,
  waiting_charges NUMERIC(10, 2) DEFAULT 0,
  night_charges NUMERIC(10, 2) DEFAULT 0, -- Extra charges for night rides
  gst_amount NUMERIC(10, 2) DEFAULT 0,
  discount_amount NUMERIC(10, 2) DEFAULT 0,
  total_fare NUMERIC(10, 2) NOT NULL,
  rider_earning NUMERIC(10, 2) NOT NULL, -- After commission
  commission_amount NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ride_fare_breakdown_order_id_idx ON ride_fare_breakdown(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS ride_fare_breakdown_order_id_unique_idx ON ride_fare_breakdown(order_id);

-- Ride Route Tracking
CREATE TABLE IF NOT EXISTS ride_routes (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  waypoint_order INTEGER NOT NULL, -- 0 = pickup, 1+ = waypoints, last = drop
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  arrived_at TIMESTAMP WITH TIME ZONE,
  departed_at TIMESTAMP WITH TIME ZONE,
  waiting_time_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ride_routes_order_id_idx ON ride_routes(order_id);
CREATE INDEX IF NOT EXISTS ride_routes_order_waypoint_idx ON ride_routes(order_id, waypoint_order);
CREATE INDEX IF NOT EXISTS ride_routes_arrived_at_idx ON ride_routes(arrived_at) WHERE arrived_at IS NOT NULL;

-- ============================================================================
-- COMMON: ORDER ITEMS (Generic items table for all order types)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL, -- 'food_item', 'parcel', 'passenger', etc.
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10, 2),
  total_price NUMERIC(10, 2),
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_item_type_idx ON order_items(item_type);
CREATE INDEX IF NOT EXISTS order_items_order_created_idx ON order_items(order_id, created_at);

-- ============================================================================
-- ORDER STATUS HISTORY (Detailed status tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_status_history (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_status_type,
  to_status order_status_type NOT NULL,
  changed_by TEXT NOT NULL, -- 'rider', 'customer', 'merchant', 'system', 'admin'
  changed_by_id INTEGER, -- Rider ID, customer ID, etc.
  reason TEXT,
  location_lat DOUBLE PRECISION,
  location_lon DOUBLE PRECISION,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_status_history_order_id_idx ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS order_status_history_to_status_idx ON order_status_history(to_status);
CREATE INDEX IF NOT EXISTS order_status_history_created_at_idx ON order_status_history(created_at);
CREATE INDEX IF NOT EXISTS order_status_history_order_created_idx ON order_status_history(order_id, created_at DESC);

-- ============================================================================
-- ORDER ASSIGNMENT LOG (Tracks assignment attempts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_assignments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  assignment_method TEXT NOT NULL, -- 'auto', 'manual', 'broadcast', 'rider_request'
  distance_km NUMERIC(5, 2), -- Distance from rider to pickup
  estimated_arrival_minutes INTEGER,
  assignment_score NUMERIC(5, 2), -- Algorithm score
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'timeout', 'cancelled'
  responded_at TIMESTAMP WITH TIME ZONE,
  response_time_seconds INTEGER, -- Time taken to respond
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_assignments_order_id_idx ON order_assignments(order_id);
CREATE INDEX IF NOT EXISTS order_assignments_rider_id_idx ON order_assignments(rider_id);
CREATE INDEX IF NOT EXISTS order_assignments_status_idx ON order_assignments(status);
CREATE INDEX IF NOT EXISTS order_assignments_created_at_idx ON order_assignments(created_at);
CREATE INDEX IF NOT EXISTS order_assignments_order_status_idx ON order_assignments(order_id, status);

-- ============================================================================
-- ORDER RATINGS (Separate from general ratings for order-specific feedback)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_ratings (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  rated_by TEXT NOT NULL, -- 'customer', 'merchant', 'rider'
  rated_by_id INTEGER, -- Customer ID, merchant ID, or rider ID
  rating SMALLINT NOT NULL, -- 1-5
  comment TEXT,
  rating_categories JSONB DEFAULT '{}', -- e.g., {"punctuality": 5, "communication": 4, "safety": 5}
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_ratings_order_id_idx ON order_ratings(order_id);
CREATE INDEX IF NOT EXISTS order_ratings_rider_id_idx ON order_ratings(rider_id);
CREATE INDEX IF NOT EXISTS order_ratings_rated_by_idx ON order_ratings(rated_by);
CREATE INDEX IF NOT EXISTS order_ratings_created_at_idx ON order_ratings(created_at);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger for order_items updated_at (if we add it later)
-- Trigger for order_status_history (auto-create on status change)
CREATE OR REPLACE FUNCTION create_order_status_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO order_status_history (
      order_id,
      from_status,
      to_status,
      changed_by,
      changed_by_id,
      created_at
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      'system', -- Can be overridden by application
      NULL,
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_status_history_trigger ON orders;
CREATE TRIGGER orders_status_history_trigger
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION create_order_status_history();

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE order_food_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cod_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_fare_breakdown ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_ratings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE order_food_items IS 'Food items in food delivery orders. Tracks individual items with quantities and prices.';
COMMENT ON TABLE parcel_tracking_events IS 'Detailed tracking events for parcel delivery orders. Provides granular visibility.';
COMMENT ON TABLE cod_collections IS 'Cash on delivery collection tracking. Monitors COD collection and bank deposits.';
COMMENT ON TABLE ride_fare_breakdown IS 'Detailed fare breakdown for ride bookings. Shows base, distance, time, surge, and other charges.';
COMMENT ON TABLE ride_routes IS 'Route waypoints for ride bookings. Tracks pickup, waypoints, and drop locations.';
COMMENT ON TABLE order_items IS 'Generic items table for all order types. Can store food items, parcels, or other items.';
COMMENT ON TABLE order_status_history IS 'Complete history of order status changes. Provides audit trail for order lifecycle.';
COMMENT ON TABLE order_assignments IS 'Tracks all assignment attempts to riders. Useful for analyzing assignment algorithm performance.';
COMMENT ON TABLE order_ratings IS 'Order-specific ratings. Separate from general rider ratings for detailed order feedback.';

COMMENT ON COLUMN orders.restaurant_name IS 'Restaurant name for food delivery orders';
COMMENT ON COLUMN orders.package_weight_kg IS 'Package weight in kilograms for parcel delivery';
COMMENT ON COLUMN orders.passenger_count IS 'Number of passengers for ride booking';
COMMENT ON COLUMN orders.ride_type IS 'Ride type: shared, private, premium, economy';
COMMENT ON COLUMN orders.surge_multiplier IS 'Surge pricing multiplier (1.0 = no surge, 1.5 = 50% surge)';
COMMENT ON COLUMN orders.delivery_proof_type IS 'Type of delivery proof: photo, signature, OTP, or none';
