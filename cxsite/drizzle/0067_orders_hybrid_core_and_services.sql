-- ============================================================================
-- Order Domain: Hybrid Core + Service-Specific Tables
-- Migration: 0067_orders_hybrid_core_and_services
--
-- Creates orders_core (identity, parties, location with 6-decimal lat/lon,
-- address raw/normalized/geocoded, deviation/mismatch flags), orders_food,
-- orders_parcel, orders_ride (1:1 per order_type), order_providers registry,
-- and order_provider_mapping (replaces provider-specific columns on orders).
-- Does NOT drop existing orders table; coexists for migration/backfill.
-- ============================================================================

-- Ensure order_source_type exists (from 0008)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_source_type') THEN
    CREATE TYPE order_source_type AS ENUM (
      'internal', 'swiggy', 'zomato', 'rapido', 'ondc', 'shiprocket', 'other'
    );
  END IF;
END $$;

-- Ensure payment_status_type and payment_mode_type exist (from 0008)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_type') THEN
    CREATE TYPE payment_status_type AS ENUM (
      'pending', 'processing', 'completed', 'failed',
      'refunded', 'partially_refunded', 'cancelled'
    );
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_mode_type') THEN
    CREATE TYPE payment_mode_type AS ENUM (
      'cash', 'online', 'wallet', 'upi', 'card', 'netbanking', 'cod', 'other'
    );
  END IF;
END $$;

-- Ensure veg_non_veg_type exists (from 0008)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'veg_non_veg_type') THEN
    CREATE TYPE veg_non_veg_type AS ENUM ('veg', 'non_veg', 'mixed', 'na');
  END IF;
END $$;

-- ============================================================================
-- Order providers registry (slim; replaces per-order provider columns)
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_providers (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE order_providers IS 'Registry of order sources: internal, swiggy, zomato, ondc, rapido, shiprocket, etc.';

CREATE INDEX IF NOT EXISTS order_providers_code_idx ON order_providers(code);
CREATE INDEX IF NOT EXISTS order_providers_is_active_idx ON order_providers(is_active);

-- ============================================================================
-- orders_core: single source of truth for all order types
-- Lat/lon stored with 6 decimal places (numeric 9,6 ≈ 0.1m)
-- ============================================================================
CREATE TABLE IF NOT EXISTS orders_core (
  id BIGSERIAL PRIMARY KEY,
  order_uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  order_type order_type NOT NULL,
  order_source order_source_type NOT NULL DEFAULT 'internal',
  external_ref TEXT,

  -- Party references
  rider_id INTEGER REFERENCES riders(id) ON DELETE SET NULL,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  merchant_store_id BIGINT REFERENCES merchant_stores(id) ON DELETE SET NULL,
  merchant_parent_id BIGINT,

  -- Pickup location (6 decimal places for lat/lon)
  pickup_address_raw TEXT NOT NULL,
  pickup_address_normalized TEXT,
  pickup_address_geocoded TEXT,
  pickup_lat NUMERIC(9, 6) NOT NULL,
  pickup_lon NUMERIC(9, 6) NOT NULL,

  -- Drop location
  drop_address_raw TEXT NOT NULL,
  drop_address_normalized TEXT,
  drop_address_geocoded TEXT,
  drop_lat NUMERIC(9, 6) NOT NULL,
  drop_lon NUMERIC(9, 6) NOT NULL,

  -- Distance and ETA (Mapbox or app-calculated)
  distance_km NUMERIC(10, 2),
  eta_seconds INTEGER,
  pickup_address_deviation_meters NUMERIC(8, 2),
  drop_address_deviation_meters NUMERIC(8, 2),
  distance_mismatch_flagged BOOLEAN NOT NULL DEFAULT FALSE,

  -- Financial (denormalized for read performance)
  fare_amount NUMERIC(10, 2),
  commission_amount NUMERIC(10, 2),
  rider_earning NUMERIC(10, 2),

  -- Status
  status order_status_type NOT NULL DEFAULT 'assigned',
  current_status TEXT,
  payment_status payment_status_type DEFAULT 'pending',
  payment_method payment_mode_type,

  -- Risk and bulk
  risk_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  risk_reason TEXT,
  is_bulk_order BOOLEAN NOT NULL DEFAULT FALSE,
  bulk_order_group_id TEXT,

  -- Cancellation
  cancellation_reason_id BIGINT,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancelled_by TEXT,
  cancelled_by_id BIGINT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  estimated_pickup_time TIMESTAMP WITH TIME ZONE,
  estimated_delivery_time TIMESTAMP WITH TIME ZONE,
  actual_pickup_time TIMESTAMP WITH TIME ZONE,
  actual_delivery_time TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE orders_core IS 'Core order table for all types (food, parcel, person_ride). Join to orders_food/orders_parcel/orders_ride by order_type.';
COMMENT ON COLUMN orders_core.pickup_lat IS 'Latitude with minimum 6 decimal places for accuracy (~0.1m).';
COMMENT ON COLUMN orders_core.distance_mismatch_flagged IS 'True when address vs Mapbox/customer deviation > 700m.';

CREATE INDEX IF NOT EXISTS orders_core_rider_id_idx ON orders_core(rider_id);
CREATE INDEX IF NOT EXISTS orders_core_status_idx ON orders_core(status);
CREATE INDEX IF NOT EXISTS orders_core_order_type_idx ON orders_core(order_type);
CREATE INDEX IF NOT EXISTS orders_core_created_at_idx ON orders_core(created_at);
CREATE INDEX IF NOT EXISTS orders_core_customer_id_idx ON orders_core(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_core_order_source_idx ON orders_core(order_source);
CREATE INDEX IF NOT EXISTS orders_core_order_uuid_idx ON orders_core(order_uuid);
CREATE INDEX IF NOT EXISTS orders_core_rider_status_idx ON orders_core(rider_id, status);
CREATE INDEX IF NOT EXISTS orders_core_type_status_created_idx ON orders_core(order_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_core_active_rider_idx ON orders_core(rider_id, order_type, created_at DESC)
  WHERE status NOT IN ('delivered', 'cancelled', 'failed');
CREATE INDEX IF NOT EXISTS orders_core_risk_flagged_idx ON orders_core(risk_flagged) WHERE risk_flagged = TRUE;
CREATE INDEX IF NOT EXISTS orders_core_distance_mismatch_idx ON orders_core(distance_mismatch_flagged) WHERE distance_mismatch_flagged = TRUE;

-- Optional FK to order_cancellation_reasons if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_cancellation_reasons') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'orders_core_cancellation_reason_id_fkey'
        AND table_name = 'orders_core'
    ) THEN
      ALTER TABLE orders_core
        ADD CONSTRAINT orders_core_cancellation_reason_id_fkey
        FOREIGN KEY (cancellation_reason_id) REFERENCES order_cancellation_reasons(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- orders_food: 1:1 with orders_core when order_type = 'food'
-- ============================================================================
CREATE TABLE IF NOT EXISTS orders_food (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL UNIQUE REFERENCES orders_core(id) ON DELETE CASCADE,
  merchant_store_id BIGINT REFERENCES merchant_stores(id) ON DELETE SET NULL,
  merchant_parent_id BIGINT,
  restaurant_name TEXT,
  restaurant_phone TEXT,
  preparation_time_minutes INTEGER,
  food_items_count INTEGER,
  food_items_total_value NUMERIC(12, 2),
  requires_utensils BOOLEAN DEFAULT FALSE,
  is_fragile BOOLEAN NOT NULL DEFAULT FALSE,
  is_high_value BOOLEAN NOT NULL DEFAULT FALSE,
  veg_non_veg veg_non_veg_type,
  delivery_instructions TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE orders_food IS 'Food-specific details. One row per food order (orders_core.order_type = food).';
COMMENT ON COLUMN orders_food.is_high_value IS 'True when order value >= 1200 (e.g. bulk/high-value flag).';

CREATE INDEX IF NOT EXISTS orders_food_order_id_idx ON orders_food(order_id);
CREATE INDEX IF NOT EXISTS orders_food_merchant_store_id_idx ON orders_food(merchant_store_id) WHERE merchant_store_id IS NOT NULL;

-- ============================================================================
-- orders_parcel: 1:1 with orders_core when order_type = 'parcel'
-- ============================================================================
CREATE TABLE IF NOT EXISTS orders_parcel (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL UNIQUE REFERENCES orders_core(id) ON DELETE CASCADE,
  weight_kg NUMERIC(10, 2),
  length_cm NUMERIC(5, 2),
  width_cm NUMERIC(5, 2),
  height_cm NUMERIC(5, 2),
  parcel_type TEXT,
  declared_value NUMERIC(12, 2),
  insurance_required BOOLEAN NOT NULL DEFAULT FALSE,
  insurance_amount NUMERIC(10, 2),
  is_cod BOOLEAN DEFAULT FALSE,
  cod_amount NUMERIC(10, 2),
  requires_signature BOOLEAN DEFAULT FALSE,
  requires_otp_verification BOOLEAN DEFAULT FALSE,
  instructions TEXT,
  scheduled_pickup_time TIMESTAMP WITH TIME ZONE,
  scheduled_delivery_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE orders_parcel IS 'Parcel-specific details. No merchant; sender/recipient from orders_core.';

CREATE INDEX IF NOT EXISTS orders_parcel_order_id_idx ON orders_parcel(order_id);

-- ============================================================================
-- orders_ride: 1:1 with orders_core when order_type = 'person_ride'
-- ============================================================================
CREATE TABLE IF NOT EXISTS orders_ride (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL UNIQUE REFERENCES orders_core(id) ON DELETE CASCADE,
  passenger_name TEXT,
  passenger_phone TEXT,
  passenger_count INTEGER DEFAULT 1,
  ride_type TEXT,
  vehicle_type_required TEXT,
  waiting_charges NUMERIC(10, 2) DEFAULT 0,
  toll_charges NUMERIC(10, 2) DEFAULT 0,
  parking_charges NUMERIC(10, 2) DEFAULT 0,
  scheduled_ride BOOLEAN DEFAULT FALSE,
  scheduled_pickup_time TIMESTAMP WITH TIME ZONE,
  return_trip BOOLEAN DEFAULT FALSE,
  return_pickup_address TEXT,
  return_pickup_lat NUMERIC(9, 6),
  return_pickup_lon NUMERIC(9, 6),
  return_pickup_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE orders_ride IS 'Person ride-specific details (passenger, vehicle, charges, scheduled, return).';

CREATE INDEX IF NOT EXISTS orders_ride_order_id_idx ON orders_ride(order_id);
CREATE INDEX IF NOT EXISTS orders_ride_scheduled_idx ON orders_ride(scheduled_ride, scheduled_pickup_time) WHERE scheduled_ride = TRUE;

-- ============================================================================
-- order_provider_mapping: replaces swiggy_order_id, zomato_order_id, etc.
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_provider_mapping (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders_core(id) ON DELETE CASCADE,
  provider_id BIGINT NOT NULL REFERENCES order_providers(id) ON DELETE RESTRICT,
  provider_order_id TEXT NOT NULL,
  provider_reference TEXT,
  provider_status TEXT,
  provider_status_updated_at TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE,
  sync_status TEXT,
  sync_error TEXT,
  provider_metadata JSONB DEFAULT '{}'::JSONB,
  provider_fare NUMERIC(12, 2),
  provider_commission NUMERIC(12, 2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(provider_id, provider_order_id)
);

COMMENT ON TABLE order_provider_mapping IS 'One row per order–provider pair. Replaces provider-specific columns on orders.';

CREATE INDEX IF NOT EXISTS order_provider_mapping_order_id_idx ON order_provider_mapping(order_id);
CREATE INDEX IF NOT EXISTS order_provider_mapping_provider_order_idx ON order_provider_mapping(provider_id, provider_order_id);

-- Seed default order_providers if empty
INSERT INTO order_providers (code, name) VALUES
  ('internal', 'Internal App'),
  ('swiggy', 'Swiggy'),
  ('zomato', 'Zomato'),
  ('rapido', 'Rapido'),
  ('ondc', 'ONDC'),
  ('shiprocket', 'Shiprocket'),
  ('other', 'Other')
ON CONFLICT (code) DO NOTHING;
