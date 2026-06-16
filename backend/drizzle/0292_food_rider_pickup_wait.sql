-- Track how long riders wait at merchant pickup (reached pickup → picked up).
-- Migration: 0292_food_rider_pickup_wait

ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS rider_reached_pickup_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS pickup_wait_seconds INTEGER NULL;

COMMENT ON COLUMN public.orders_food.rider_reached_pickup_at IS
  'When assigned rider marked reached pickup at merchant (GPS milestone).';
COMMENT ON COLUMN public.orders_food.pickup_wait_seconds IS
  'Seconds rider waited at pickup from reached pickup until order picked up. NULL while still waiting.';

UPDATE public.orders_food f
SET rider_reached_pickup_at = sub.reached_merchant_at
FROM (
  SELECT DISTINCT ON (COALESCE(order_core_id, order_id))
    COALESCE(order_core_id, order_id) AS core_id,
    reached_merchant_at
  FROM public.order_rider_assignments
  WHERE reached_merchant_at IS NOT NULL
  ORDER BY COALESCE(order_core_id, order_id), reached_merchant_at DESC
) sub
WHERE f.order_id = sub.core_id
  AND f.rider_reached_pickup_at IS NULL;

UPDATE public.orders_food f
SET pickup_wait_seconds = GREATEST(
  0,
  EXTRACT(EPOCH FROM (sub.picked_up_at - sub.reached_merchant_at))::INTEGER
)
FROM (
  SELECT DISTINCT ON (COALESCE(order_core_id, order_id))
    COALESCE(order_core_id, order_id) AS core_id,
    reached_merchant_at,
    picked_up_at
  FROM public.order_rider_assignments
  WHERE reached_merchant_at IS NOT NULL
    AND picked_up_at IS NOT NULL
  ORDER BY COALESCE(order_core_id, order_id), picked_up_at DESC
) sub
WHERE f.order_id = sub.core_id
  AND f.pickup_wait_seconds IS NULL;

CREATE OR REPLACE FUNCTION public.sync_food_rider_reached_pickup_from_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reached_merchant_at IS NOT NULL THEN
    UPDATE public.orders_food
    SET
      rider_reached_pickup_at = COALESCE(rider_reached_pickup_at, NEW.reached_merchant_at),
      updated_at = now()
    WHERE order_id = COALESCE(NEW.order_core_id, NEW.order_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_food_rider_reached_pickup ON public.order_rider_assignments;
CREATE TRIGGER trg_sync_food_rider_reached_pickup
  AFTER INSERT OR UPDATE OF reached_merchant_at ON public.order_rider_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_food_rider_reached_pickup_from_assignment();

CREATE OR REPLACE FUNCTION public.sync_food_rider_picked_up_from_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  core_pk BIGINT;
  reached_ts TIMESTAMPTZ;
BEGIN
  IF NEW.picked_up_at IS NOT NULL THEN
    core_pk := COALESCE(NEW.order_core_id, NEW.order_id);
    reached_ts := COALESCE(NEW.reached_merchant_at, (
      SELECT rider_reached_pickup_at
      FROM public.orders_food
      WHERE order_id = core_pk
      LIMIT 1
    ));

    UPDATE public.orders_food
    SET
      rider_picked_up_at = COALESCE(rider_picked_up_at, NEW.picked_up_at),
      dispatched_at = COALESCE(dispatched_at, NEW.picked_up_at),
      rider_reached_pickup_at = COALESCE(rider_reached_pickup_at, NEW.reached_merchant_at),
      pickup_wait_seconds = CASE
        WHEN pickup_wait_seconds IS NULL AND reached_ts IS NOT NULL THEN
          GREATEST(0, EXTRACT(EPOCH FROM (NEW.picked_up_at - reached_ts))::INTEGER)
        ELSE pickup_wait_seconds
      END,
      updated_at = now()
    WHERE order_id = core_pk;

    UPDATE public.orders_core
    SET
      rider_picked_up_at = COALESCE(rider_picked_up_at, NEW.picked_up_at),
      actual_pickup_time = COALESCE(actual_pickup_time, NEW.picked_up_at),
      updated_at = now()
    WHERE id = core_pk;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_food_rider_picked_up ON public.order_rider_assignments;
CREATE TRIGGER trg_sync_food_rider_picked_up
  AFTER INSERT OR UPDATE OF picked_up_at ON public.order_rider_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_food_rider_picked_up_from_assignment();
