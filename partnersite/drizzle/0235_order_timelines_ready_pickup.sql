-- Record Ready / Handover / Picked Up in order_timelines + timeline rows on rider pickup.

CREATE OR REPLACE FUNCTION public.append_order_timeline_if_missing(
  p_order_id bigint,
  p_status text,
  p_actor_type text,
  p_status_message text,
  p_occurred_at timestamptz,
  p_actor_id bigint DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.order_timelines
    WHERE order_id = p_order_id AND status = p_status
  ) THEN
    RETURN;
  END IF;

  SELECT ot.status INTO v_prev
  FROM public.order_timelines ot
  WHERE ot.order_id = p_order_id
  ORDER BY ot.occurred_at DESC, ot.id DESC
  LIMIT 1;

  INSERT INTO public.order_timelines (
    order_id,
    status,
    previous_status,
    actor_type,
    actor_id,
    actor_name,
    status_message,
    metadata,
    occurred_at
  ) VALUES (
    p_order_id,
    p_status,
    v_prev,
    p_actor_type,
    p_actor_id,
    p_actor_name,
    p_status_message,
    p_metadata,
    p_occurred_at
  );
END;
$$;

-- Backfill Ready from prepared_at
INSERT INTO public.order_timelines (
  order_id, status, previous_status, actor_type, status_message, metadata, occurred_at
)
SELECT
  f.order_id,
  'Ready',
  (
    SELECT ot.status FROM public.order_timelines ot
    WHERE ot.order_id = f.order_id
    ORDER BY ot.occurred_at DESC, ot.id DESC
    LIMIT 1
  ),
  'store',
  'Order marked ready for pickup',
  jsonb_build_object('backfill', true),
  f.prepared_at
FROM public.orders_food f
WHERE f.prepared_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.order_timelines ot
    WHERE ot.order_id = f.order_id AND ot.status = 'Ready'
  );

-- Backfill Handover from handed_over_to_rider_at / verified OTP
INSERT INTO public.order_timelines (
  order_id, status, previous_status, actor_type, status_message, metadata, occurred_at
)
SELECT
  f.order_id,
  'Handed Over to Rider',
  (
    SELECT ot.status FROM public.order_timelines ot
    WHERE ot.order_id = f.order_id
    ORDER BY ot.occurred_at DESC, ot.id DESC
    LIMIT 1
  ),
  'store',
  'Food handed over to delivery partner (pickup OTP verified)',
  jsonb_build_object('backfill', true),
  f.handed_over_to_rider_at
FROM public.orders_food f
WHERE f.handed_over_to_rider_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.order_timelines ot
    WHERE ot.order_id = f.order_id AND ot.status = 'Handed Over to Rider'
  );

-- Backfill Picked Up from rider_picked_up_at / assignments
INSERT INTO public.order_timelines (
  order_id, status, previous_status, actor_type, actor_id, actor_name, status_message, metadata, occurred_at
)
SELECT
  f.order_id,
  'Picked Up',
  (
    SELECT ot.status FROM public.order_timelines ot
    WHERE ot.order_id = f.order_id
    ORDER BY ot.occurred_at DESC, ot.id DESC
    LIMIT 1
  ),
  'rider',
  a.rider_id,
  COALESCE(a.rider_name, f.rider_name),
  CASE
    WHEN COALESCE(a.rider_name, f.rider_name) IS NOT NULL
    THEN 'Picked up by ' || COALESCE(a.rider_name, f.rider_name)
    ELSE 'Order picked up by delivery partner'
  END,
  jsonb_build_object('backfill', true, 'rider_id', a.rider_id),
  COALESCE(f.rider_picked_up_at, a.picked_up_at)
FROM public.orders_food f
LEFT JOIN LATERAL (
  SELECT ra.rider_id, ra.rider_name, ra.picked_up_at
  FROM public.order_rider_assignments ra
  WHERE ra.order_id = f.order_id AND ra.picked_up_at IS NOT NULL
  ORDER BY ra.picked_up_at DESC
  LIMIT 1
) a ON true
WHERE COALESCE(f.rider_picked_up_at, a.picked_up_at) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.order_timelines ot
    WHERE ot.order_id = f.order_id AND ot.status = 'Picked Up'
  );

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

    PERFORM public.append_order_timeline_if_missing(
      NEW.order_id,
      'Picked Up',
      'rider',
      CASE
        WHEN NEW.rider_name IS NOT NULL THEN 'Picked up by ' || NEW.rider_name
        ELSE 'Order picked up by delivery partner'
      END,
      NEW.picked_up_at,
      NEW.rider_id,
      NEW.rider_name,
      jsonb_build_object('rider_id', NEW.rider_id, 'rider_name', NEW.rider_name)
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.append_order_timeline_if_missing IS
  'Inserts one order_timelines row per (order_id, status); used for Ready, Handover, Picked Up.';
