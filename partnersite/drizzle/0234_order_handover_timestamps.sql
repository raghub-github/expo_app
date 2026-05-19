-- Track merchant handover and rider pickup durations on ready orders.

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

COMMENT ON COLUMN public.orders_core.handed_over_to_rider_at IS
  'Mirror of orders_food.handed_over_to_rider_at for unified pipeline.';
COMMENT ON COLUMN public.orders_core.rider_picked_up_at IS
  'Mirror of orders_food.rider_picked_up_at for unified pipeline.';

-- Backfill handover from verified pickup OTP
UPDATE public.orders_food f
SET handed_over_to_rider_at = o.verified_at
FROM public.order_food_otps o
WHERE o.order_id = f.order_id
  AND o.otp_type = 'PICKUP'
  AND o.verified_at IS NOT NULL
  AND f.handed_over_to_rider_at IS NULL;

UPDATE public.orders_core c
SET handed_over_to_rider_at = f.handed_over_to_rider_at
FROM public.orders_food f
WHERE f.order_id = c.id
  AND f.handed_over_to_rider_at IS NOT NULL
  AND c.handed_over_to_rider_at IS NULL;

-- Backfill rider pickup from latest assignment
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

UPDATE public.orders_core c
SET rider_picked_up_at = COALESCE(c.actual_pickup_time, f.rider_picked_up_at)
FROM public.orders_food f
WHERE f.order_id = c.id
  AND c.rider_picked_up_at IS NULL
  AND (f.rider_picked_up_at IS NOT NULL OR c.actual_pickup_time IS NOT NULL);

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
