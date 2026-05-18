-- Mirror: partnersite/drizzle/0234_order_handover_timestamps.sql

ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS handed_over_to_rider_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS rider_picked_up_at TIMESTAMPTZ NULL;

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS handed_over_to_rider_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS rider_picked_up_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.orders_food.handed_over_to_rider_at IS
  'When merchant handed order to rider (pickup OTP verified or explicit handover).';
COMMENT ON COLUMN public.orders_food.rider_picked_up_at IS
  'When rider marked picked up (from order_rider_assignments or orders_core.actual_pickup_time).';

UPDATE public.orders_food f
SET handed_over_to_rider_at = o.verified_at
FROM public.order_food_otps o
WHERE o.order_id = f.order_id
  AND o.otp_type = 'PICKUP'
  AND o.verified_at IS NOT NULL
  AND f.handed_over_to_rider_at IS NULL;

UPDATE public.orders_food f
SET rider_picked_up_at = sub.picked_up_at
FROM (
  SELECT DISTINCT ON (order_id) order_id, picked_up_at
  FROM public.order_rider_assignments
  WHERE picked_up_at IS NOT NULL
  ORDER BY order_id, picked_up_at DESC
) sub
WHERE f.order_id = sub.order_id
  AND f.rider_picked_up_at IS NULL;

CREATE OR REPLACE FUNCTION public.sync_food_rider_picked_up_from_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.picked_up_at IS NOT NULL THEN
    UPDATE public.orders_food
    SET
      rider_picked_up_at = COALESCE(rider_picked_up_at, NEW.picked_up_at),
      dispatched_at = COALESCE(dispatched_at, NEW.picked_up_at),
      updated_at = now()
    WHERE order_id = NEW.order_id;

    UPDATE public.orders_core
    SET
      rider_picked_up_at = COALESCE(rider_picked_up_at, NEW.picked_up_at),
      actual_pickup_time = COALESCE(actual_pickup_time, NEW.picked_up_at),
      updated_at = now()
    WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_food_rider_picked_up ON public.order_rider_assignments;
CREATE TRIGGER trg_sync_food_rider_picked_up
  AFTER INSERT OR UPDATE OF picked_up_at ON public.order_rider_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_food_rider_picked_up_from_assignment();
