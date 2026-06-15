-- Mirror: backend/drizzle/0293_food_rider_pickup_timer.sql
ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS pickup_timer_started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS pickup_duration_seconds INTEGER NULL;

COMMENT ON COLUMN public.orders_food.pickup_wait_seconds IS
  'Seconds rider waited at pickup from reached pickup until merchant marked ready. 0 if order was already ready. NULL while still waiting.';
COMMENT ON COLUMN public.orders_food.pickup_timer_started_at IS
  'When the pickup window started (merchant ready with rider at store, or rider reach if order was already ready).';
COMMENT ON COLUMN public.orders_food.pickup_duration_seconds IS
  'Seconds from pickup_timer_started_at until rider picked up the order.';

CREATE OR REPLACE FUNCTION public.food_finalize_wait_on_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  ready_ts TIMESTAMPTZ;
  became_ready BOOLEAN;
BEGIN
  became_ready :=
    (NEW.order_status = 'READY_FOR_PICKUP' AND OLD.order_status IS DISTINCT FROM 'READY_FOR_PICKUP')
    OR (NEW.prepared_at IS NOT NULL AND OLD.prepared_at IS NULL);

  IF NOT became_ready THEN
    RETURN NEW;
  END IF;

  ready_ts := COALESCE(NEW.prepared_at, NOW());

  IF NEW.rider_reached_pickup_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.rider_reached_pickup_at >= ready_ts THEN
    IF NEW.pickup_wait_seconds IS NULL THEN
      NEW.pickup_wait_seconds := 0;
    END IF;
  ELSIF NEW.pickup_wait_seconds IS NULL THEN
    NEW.pickup_wait_seconds := GREATEST(
      0,
      EXTRACT(EPOCH FROM (ready_ts - NEW.rider_reached_pickup_at))::INTEGER
    );
  END IF;

  IF NEW.pickup_timer_started_at IS NULL THEN
    NEW.pickup_timer_started_at := ready_ts;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.food_start_pickup_timer_on_rider_reach()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.rider_reached_pickup_at IS NULL
     OR OLD.rider_reached_pickup_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.prepared_at IS NOT NULL
     AND NEW.order_status IN ('READY_FOR_PICKUP', 'OUT_FOR_DELIVERY') THEN
    IF NEW.pickup_wait_seconds IS NULL THEN
      NEW.pickup_wait_seconds := 0;
    END IF;
    IF NEW.pickup_timer_started_at IS NULL THEN
      NEW.pickup_timer_started_at := NEW.rider_reached_pickup_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_food_finalize_wait_on_ready ON public.orders_food;
CREATE TRIGGER trg_food_finalize_wait_on_ready
  BEFORE UPDATE ON public.orders_food
  FOR EACH ROW
  EXECUTE FUNCTION public.food_finalize_wait_on_ready();

DROP TRIGGER IF EXISTS trg_food_start_pickup_timer_on_rider_reach ON public.orders_food;
CREATE TRIGGER trg_food_start_pickup_timer_on_rider_reach
  BEFORE UPDATE ON public.orders_food
  FOR EACH ROW
  EXECUTE FUNCTION public.food_start_pickup_timer_on_rider_reach();

CREATE OR REPLACE FUNCTION public.sync_food_rider_picked_up_from_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  core_pk BIGINT;
  timer_started TIMESTAMPTZ;
BEGIN
  IF NEW.picked_up_at IS NOT NULL THEN
    core_pk := COALESCE(NEW.order_core_id, NEW.order_id);

    SELECT pickup_timer_started_at
    INTO timer_started
    FROM public.orders_food
    WHERE order_id = core_pk
    LIMIT 1;

    UPDATE public.orders_food
    SET
      rider_picked_up_at = COALESCE(rider_picked_up_at, NEW.picked_up_at),
      dispatched_at = COALESCE(dispatched_at, NEW.picked_up_at),
      rider_reached_pickup_at = COALESCE(rider_reached_pickup_at, NEW.reached_merchant_at),
      pickup_duration_seconds = CASE
        WHEN pickup_duration_seconds IS NULL AND timer_started IS NOT NULL THEN
          GREATEST(0, EXTRACT(EPOCH FROM (NEW.picked_up_at - timer_started))::INTEGER)
        ELSE pickup_duration_seconds
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
