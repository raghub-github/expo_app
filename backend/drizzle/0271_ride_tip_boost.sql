-- Ride tip boost + search extension when rider matching times out
ALTER TABLE orders_ride
  ADD COLUMN IF NOT EXISTS customer_tip_amount numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispatch_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS search_extended_until timestamptz,
  ADD COLUMN IF NOT EXISTS tip_boost_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS higher_dispatch_priority boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS awaiting_tip_boost boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS orders_ride_dispatch_priority_idx
  ON orders_ride (higher_dispatch_priority DESC, customer_tip_amount DESC)
  WHERE cancelled_at IS NULL;
