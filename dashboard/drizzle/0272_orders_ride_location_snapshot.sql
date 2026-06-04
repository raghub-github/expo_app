-- ============================================================================
-- orders_ride: denormalized pickup / drop / stop coordinates + pickup OTP mirror
-- Migration: 0272_orders_ride_location_snapshot
-- ============================================================================

ALTER TABLE public.orders_ride
  ADD COLUMN IF NOT EXISTS pickup_address text,
  ADD COLUMN IF NOT EXISTS pickup_lat numeric(9, 6),
  ADD COLUMN IF NOT EXISTS pickup_lon numeric(9, 6),
  ADD COLUMN IF NOT EXISTS drop_address text,
  ADD COLUMN IF NOT EXISTS drop_lat numeric(9, 6),
  ADD COLUMN IF NOT EXISTS drop_lon numeric(9, 6),
  ADD COLUMN IF NOT EXISTS stop_1_address text,
  ADD COLUMN IF NOT EXISTS stop_1_lat numeric(9, 6),
  ADD COLUMN IF NOT EXISTS stop_1_lon numeric(9, 6),
  ADD COLUMN IF NOT EXISTS stop_2_address text,
  ADD COLUMN IF NOT EXISTS stop_2_lat numeric(9, 6),
  ADD COLUMN IF NOT EXISTS stop_2_lon numeric(9, 6),
  ADD COLUMN IF NOT EXISTS pickup_otp text;

COMMENT ON COLUMN public.orders_ride.pickup_address IS
  'Pickup address snapshot at booking (mirrors orders_core.pickup_address_raw).';
COMMENT ON COLUMN public.orders_ride.pickup_otp IS
  '4-digit pickup OTP for rider verification (mirrors orders_core.pickup_otp).';

UPDATE public.orders_ride r
SET
  pickup_address = COALESCE(r.pickup_address, c.pickup_address_raw),
  pickup_lat = COALESCE(r.pickup_lat, c.pickup_lat),
  pickup_lon = COALESCE(r.pickup_lon, c.pickup_lon),
  drop_address = COALESCE(r.drop_address, c.drop_address_raw),
  drop_lat = COALESCE(r.drop_lat, c.drop_lat),
  drop_lon = COALESCE(r.drop_lon, c.drop_lon),
  pickup_otp = COALESCE(r.pickup_otp, c.pickup_otp)
FROM public.orders_core c
WHERE c.id = r.order_id;

UPDATE public.orders_ride r
SET
  stop_1_address = COALESCE(r.stop_1_address, r.intermediate_stops -> 0 ->> 'address'),
  stop_1_lat = COALESCE(
    r.stop_1_lat,
    NULLIF(r.intermediate_stops -> 0 ->> 'latitude', '')::numeric
  ),
  stop_1_lon = COALESCE(
    r.stop_1_lon,
    NULLIF(r.intermediate_stops -> 0 ->> 'longitude', '')::numeric
  ),
  stop_2_address = COALESCE(r.stop_2_address, r.intermediate_stops -> 1 ->> 'address'),
  stop_2_lat = COALESCE(
    r.stop_2_lat,
    NULLIF(r.intermediate_stops -> 1 ->> 'latitude', '')::numeric
  ),
  stop_2_lon = COALESCE(
    r.stop_2_lon,
    NULLIF(r.intermediate_stops -> 1 ->> 'longitude', '')::numeric
  )
WHERE jsonb_typeof(r.intermediate_stops) = 'array'
  AND jsonb_array_length(r.intermediate_stops) > 0;
