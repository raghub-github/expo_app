-- Pickup-radius configuration ONLY (rider GPS → order pickup). Not used for drop/trip distance.
-- Runtime: order-assignment-engine reads this table on every dispatch decision (no cache).
CREATE TABLE IF NOT EXISTS public.platform_rider_dispatch_pickup_radius (
  service_type TEXT PRIMARY KEY,
  radius_meters INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_rider_dispatch_pickup_radius_service_check
    CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT platform_rider_dispatch_pickup_radius_meters_check
    CHECK (radius_meters > 0 AND radius_meters <= 50000)
);

COMMENT ON TABLE public.platform_rider_dispatch_pickup_radius IS
  'Max distance (meters) from rider GPS to order pickup for pool dispatch, per service type.';

INSERT INTO public.platform_rider_dispatch_pickup_radius (service_type, radius_meters)
VALUES
  ('food', 3000),
  ('parcel', 3000),
  ('person_ride', 15000)
ON CONFLICT (service_type) DO NOTHING;

DROP TRIGGER IF EXISTS platform_rider_dispatch_pickup_radius_touch
  ON public.platform_rider_dispatch_pickup_radius;
CREATE TRIGGER platform_rider_dispatch_pickup_radius_touch
BEFORE UPDATE ON public.platform_rider_dispatch_pickup_radius
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
