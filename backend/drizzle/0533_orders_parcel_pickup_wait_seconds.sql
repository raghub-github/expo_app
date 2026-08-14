-- Parcel never had a finalized pickup-waiting-time column (orders_food and orders_ride
-- both already have pickup_wait_seconds; orders_parcel only had rider_reached_pickup_at,
-- with nothing recording how long the rider actually waited once there). This adds the
-- same column, in the same shape, so parcel can use the identical waiting-charge engine
-- (service_payout_rules waiting_* columns + rideWaitingCharge.computeWaitingCharge) already
-- used by food and ride.

ALTER TABLE orders_parcel
  ADD COLUMN IF NOT EXISTS pickup_wait_seconds integer NULL;

COMMENT ON COLUMN orders_parcel.pickup_wait_seconds IS
  'Finalized seconds from rider_reached_pickup_at to actual pickup — set once, at pickup confirmation. NULL until then.';
