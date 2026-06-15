-- Person ride: waiting time from rider reach until customer shares pickup OTP.
-- Migration: 0336_ride_pickup_wait

ALTER TABLE public.orders_ride
  ADD COLUMN IF NOT EXISTS pickup_wait_seconds INTEGER NULL;

COMMENT ON COLUMN public.orders_ride.pickup_wait_seconds IS
  'Seconds from rider_reached_pickup_at until pickup OTP verified. NULL while still waiting for OTP.';

COMMENT ON COLUMN public.orders_ride.rider_reached_pickup_at IS
  'When rider marked reached at passenger pickup (before OTP). Starts pickup wait timer.';
