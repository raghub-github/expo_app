-- ============================================================================
-- orders_ride: guest booking (someone else), far-pickup metadata, intermediate stops
-- Migration: 0263_orders_ride_booking_guest_and_stops
-- Supports customer app: far-pickup bottom sheet, "For me" vs guest, max 2 stops
-- ============================================================================

ALTER TABLE public.orders_ride
  ADD COLUMN IF NOT EXISTS booked_for_self BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS pickup_distance_from_booker_km NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS far_pickup_prompt_shown BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS far_pickup_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS intermediate_stops JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.orders_ride.booked_for_self IS
  'TRUE when booker rides themselves; FALSE when booking for a guest (passenger_name/phone populated).';

COMMENT ON COLUMN public.orders_ride.pickup_distance_from_booker_km IS
  'Air/road distance (km) from booker device GPS to pickup at order time; set when far-pickup prompt applies.';

COMMENT ON COLUMN public.orders_ride.far_pickup_prompt_shown IS
  'TRUE when UI showed "Booking for someone else?" because pickup was far from booker location.';

COMMENT ON COLUMN public.orders_ride.far_pickup_acknowledged IS
  'TRUE when booker chose "No, booking for me" on the far-pickup sheet (still booking for self).';

COMMENT ON COLUMN public.orders_ride.intermediate_stops IS
  'Ordered stop list (max 2): [{ "sequence": 1, "address": "...", "latitude": 25.1, "longitude": 85.1 }, ...].';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_ride_passenger_count_positive'
  ) THEN
    ALTER TABLE public.orders_ride
      ADD CONSTRAINT orders_ride_passenger_count_positive
      CHECK (passenger_count IS NULL OR passenger_count >= 1);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_ride_intermediate_stops_max_two'
  ) THEN
    ALTER TABLE public.orders_ride
      ADD CONSTRAINT orders_ride_intermediate_stops_max_two
      CHECK (jsonb_typeof(intermediate_stops) = 'array' AND jsonb_array_length(intermediate_stops) <= 2);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_ride_guest_passenger_name'
  ) THEN
    ALTER TABLE public.orders_ride
      ADD CONSTRAINT orders_ride_guest_passenger_name
      CHECK (booked_for_self = TRUE OR passenger_name IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_ride_booked_for_self_idx
  ON public.orders_ride (booked_for_self)
  WHERE booked_for_self = FALSE;

CREATE INDEX IF NOT EXISTS orders_ride_far_pickup_idx
  ON public.orders_ride (far_pickup_prompt_shown, far_pickup_acknowledged)
  WHERE far_pickup_prompt_shown = TRUE;
