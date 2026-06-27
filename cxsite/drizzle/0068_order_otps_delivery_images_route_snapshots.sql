-- ============================================================================
-- Order OTPs, Delivery Images, Route Snapshots
-- Migration: 0068_order_otps_delivery_images_route_snapshots
--
-- order_otps: pickup / delivery / rto OTP with optional bypass (e.g. image_uploaded)
-- order_delivery_images: rider images at pickup and delivery (and RTO)
-- order_route_snapshots: Mapbox response storage for distance/timing and mismatch flag
-- ============================================================================

-- OTP type: pickup, delivery, rto
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_otp_type') THEN
    CREATE TYPE order_otp_type AS ENUM ('pickup', 'delivery', 'rto');
  END IF;
END $$;

-- ============================================================================
-- order_otps
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_otps (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders_core(id) ON DELETE CASCADE,
  otp_type order_otp_type NOT NULL,
  code TEXT NOT NULL,
  verified_at TIMESTAMP WITH TIME ZONE,
  bypass_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, otp_type)
);

COMMENT ON TABLE order_otps IS 'OTP for pickup, delivery, RTO. Pickup OTP can be bypassed if rider uploads image (bypass_reason e.g. image_uploaded).';
COMMENT ON COLUMN order_otps.bypass_reason IS 'Reason OTP was bypassed, e.g. image_uploaded for pickup.';

CREATE INDEX IF NOT EXISTS order_otps_order_id_idx ON order_otps(order_id);
CREATE INDEX IF NOT EXISTS order_otps_otp_type_idx ON order_otps(otp_type);

-- ============================================================================
-- order_delivery_images
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_delivery_images (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders_core(id) ON DELETE CASCADE,
  rider_assignment_id BIGINT,
  image_type TEXT NOT NULL CHECK (image_type IN ('pickup', 'delivery', 'rto')),
  url TEXT NOT NULL,
  taken_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE order_delivery_images IS 'Rider-uploaded images at pickup, delivery, or RTO. Pickup image can bypass OTP.';

CREATE INDEX IF NOT EXISTS order_delivery_images_order_id_idx ON order_delivery_images(order_id);
CREATE INDEX IF NOT EXISTS order_delivery_images_image_type_idx ON order_delivery_images(image_type);
CREATE INDEX IF NOT EXISTS order_delivery_images_taken_at_idx ON order_delivery_images(taken_at);

-- Optional FK to order_rider_assignments when that table references orders_core
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_rider_assignments') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'order_delivery_images_rider_assignment_id_fkey'
        AND table_name = 'order_delivery_images'
    ) THEN
      ALTER TABLE order_delivery_images
        ADD CONSTRAINT order_delivery_images_rider_assignment_id_fkey
        FOREIGN KEY (rider_assignment_id) REFERENCES order_rider_assignments(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- order_route_snapshots
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_route_snapshots (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders_core(id) ON DELETE CASCADE,
  snapshot_type TEXT NOT NULL,
  distance_km NUMERIC(10, 2),
  duration_seconds INTEGER,
  polyline TEXT,
  mapbox_response JSONB,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE order_route_snapshots IS 'Stores Mapbox (or app) route/distance result. Used for distance_mismatch_flagged on orders_core when deviation > 700m.';

CREATE INDEX IF NOT EXISTS order_route_snapshots_order_id_idx ON order_route_snapshots(order_id);
CREATE INDEX IF NOT EXISTS order_route_snapshots_recorded_at_idx ON order_route_snapshots(recorded_at);
