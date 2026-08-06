-- 0505: Expand orders_parcel for customer parcel booking + rider accept lifecycle.
-- Stores pay-at, payment mode, offers, pickup/drop, vehicle, search window, assignment.
-- Also documents orders_core fields already used for parcel (no destructive core changes).
-- Idempotent: ADD COLUMN IF NOT EXISTS throughout.

-- ---------------------------------------------------------------------------
-- orders_parcel — booking + dispatch columns (ride-parity for courier)
-- ---------------------------------------------------------------------------

ALTER TABLE orders_parcel
  ADD COLUMN IF NOT EXISTS receiver_name TEXT,
  ADD COLUMN IF NOT EXISTS receiver_mobile TEXT,
  ADD COLUMN IF NOT EXISTS sender_name TEXT,
  ADD COLUMN IF NOT EXISTS sender_mobile TEXT,
  ADD COLUMN IF NOT EXISTS pickup_label TEXT,
  ADD COLUMN IF NOT EXISTS pickup_address TEXT,
  ADD COLUMN IF NOT EXISTS pickup_lat NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS pickup_lon NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS drop_label TEXT,
  ADD COLUMN IF NOT EXISTS drop_address TEXT,
  ADD COLUMN IF NOT EXISTS drop_lat NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS drop_lon NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS vehicle_category TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_type_required TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS pay_at TEXT,
  ADD COLUMN IF NOT EXISTS estimated_fare NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_fare NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS trip_distance_km NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS amount_collected NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_code TEXT,
  ADD COLUMN IF NOT EXISTS platform_offer_id BIGINT,
  ADD COLUMN IF NOT EXISTS offer_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS applied_offer_discount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pickup_otp TEXT,
  ADD COLUMN IF NOT EXISTS delivery_otp TEXT,
  ADD COLUMN IF NOT EXISTS search_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS search_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS search_timeout_sec INTEGER,
  ADD COLUMN IF NOT EXISTS assigned_rider_id INTEGER REFERENCES riders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rider_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rider_reached_pickup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_otp_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_otp_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_type TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reason_text TEXT,
  ADD COLUMN IF NOT EXISTS cash_collected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cash_collected_by_rider_id INTEGER,
  ADD COLUMN IF NOT EXISTS accept_payout_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS placement_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Soft constraints (validated as CHECKs only when value present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_parcel_pay_at_chk'
  ) THEN
    ALTER TABLE orders_parcel
      ADD CONSTRAINT orders_parcel_pay_at_chk
      CHECK (pay_at IS NULL OR pay_at IN ('pickup', 'drop'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_parcel_payment_method_chk'
  ) THEN
    ALTER TABLE orders_parcel
      ADD CONSTRAINT orders_parcel_payment_method_chk
      CHECK (
        payment_method IS NULL
        OR payment_method IN ('cash', 'cod', 'online', 'upi', 'card', 'wallet', 'other')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_parcel_vehicle_category_chk'
  ) THEN
    ALTER TABLE orders_parcel
      ADD CONSTRAINT orders_parcel_vehicle_category_chk
      CHECK (
        vehicle_category IS NULL
        OR vehicle_category IN ('2_wheeler', '3_wheeler', '4_wheeler_non_ac')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_parcel_vehicle_category_idx
  ON orders_parcel (vehicle_category)
  WHERE vehicle_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_parcel_payment_method_idx
  ON orders_parcel (payment_method)
  WHERE payment_method IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_parcel_pay_at_idx
  ON orders_parcel (pay_at)
  WHERE pay_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_parcel_search_expires_idx
  ON orders_parcel (search_expires_at)
  WHERE search_expires_at IS NOT NULL AND assigned_rider_id IS NULL;

CREATE INDEX IF NOT EXISTS orders_parcel_assigned_rider_idx
  ON orders_parcel (assigned_rider_id)
  WHERE assigned_rider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_parcel_platform_offer_idx
  ON orders_parcel (platform_offer_id)
  WHERE platform_offer_id IS NOT NULL;

COMMENT ON TABLE orders_parcel IS
  'Parcel courier details 1:1 with orders_core. Booking fields (pay_at, payment_method, offers, pickup/drop, vehicle, search, assignment) stored here; core also keeps addresses/payment/status.';

COMMENT ON COLUMN orders_parcel.pay_at IS 'Where cash/COD is collected: pickup | drop. Null when payment_method is online.';
COMMENT ON COLUMN orders_parcel.payment_method IS 'Customer payment mode at book time: cash | online (also cod legacy).';
COMMENT ON COLUMN orders_parcel.vehicle_category IS 'Customer book category: 2_wheeler | 3_wheeler | 4_wheeler_non_ac.';
COMMENT ON COLUMN orders_parcel.vehicle_type_required IS 'Dispatch vehicle family: two_wheeler | auto | cab.';
COMMENT ON COLUMN orders_parcel.offer_snapshot IS 'Frozen offer/coupon details applied or shown at placement.';
COMMENT ON COLUMN orders_parcel.placement_snapshot IS 'Full placement context (labels, payAt, fare quote, timeouts) for audits.';
COMMENT ON COLUMN orders_parcel.search_expires_at IS 'Rider search window end; used for auto-cancel like rides.';

-- ---------------------------------------------------------------------------
-- orders_core — ensure parcel-friendly contact columns exist (already present
-- on modern schemas; IF NOT EXISTS keeps older DBs safe).
-- ---------------------------------------------------------------------------

ALTER TABLE orders_core
  ADD COLUMN IF NOT EXISTS delivery_primary_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS delivery_primary_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS alternate_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS alternate_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS pickup_otp TEXT,
  ADD COLUMN IF NOT EXISTS delivery_otp TEXT,
  ADD COLUMN IF NOT EXISTS checkout_metadata JSONB;

COMMENT ON COLUMN orders_core.delivery_primary_contact_name IS
  'Parcel: receiver name at drop (also mirrored on orders_parcel.receiver_name).';
COMMENT ON COLUMN orders_core.delivery_primary_contact_phone IS
  'Parcel: receiver mobile at drop (also mirrored on orders_parcel.receiver_mobile).';
COMMENT ON COLUMN orders_core.checkout_metadata IS
  'JSON bag: serviceType, payAt, paymentMethod, vehicleCategory, offers, searchExpiresAt, labels, etc.';
