-- ============================================================================
-- Person ride pickup OTP verification timestamp
-- Migration: 0269_ride_pickup_otp_verified
-- ============================================================================

ALTER TABLE public.orders_ride
  ADD COLUMN IF NOT EXISTS pickup_otp_verified_at timestamp with time zone NULL;

COMMENT ON COLUMN public.orders_ride.pickup_otp_verified_at IS
  'When rider verified customer pickup OTP and trip started.';

COMMENT ON COLUMN public.orders_core.pickup_otp IS
  '4-digit OTP — person_ride: customer shares with rider at pickup to start trip; food: merchant handoff.';

UPDATE public.orders_core c
SET pickup_otp = lpad((floor(random() * 9000 + 1000))::int::text, 4, '0')
WHERE c.order_type = 'person_ride'::order_type
  AND (c.pickup_otp IS NULL OR btrim(c.pickup_otp) = '')
  AND c.status NOT IN ('cancelled', 'delivered');
