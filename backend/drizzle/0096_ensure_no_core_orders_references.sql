-- Ensure no references to core_orders (table may already be dropped by 0094).
-- Drop triggers on core_orders only if the table still exists; safe to run in any order.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'core_orders') THEN
    DROP TRIGGER IF EXISTS after_core_order_insert ON public.core_orders;
    DROP TRIGGER IF EXISTS after_core_order_insert_emit_placed ON public.core_orders;
  END IF;
END $$;

-- Re-apply orders_core-only versions so no function body references core_orders (idempotent)
CREATE OR REPLACE FUNCTION emit_order_event(
  p_order_id TEXT,
  p_order_source TEXT DEFAULT 'orders_core',
  p_event_type order_event_type DEFAULT NULL,
  p_to_status TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT NULL,
  p_actor_type TEXT DEFAULT NULL,
  p_actor_id BIGINT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_evt_type order_event_type;
  v_to_status TEXT;
  v_from_status TEXT;
  v_event_id BIGINT;
BEGIN
  v_evt_type := COALESCE(p_event_type, p_to_status::order_event_type);
  v_to_status := COALESCE(p_to_status, p_evt_type::TEXT);

  SELECT current_status INTO v_from_status FROM public.orders_core
  WHERE order_id = p_order_id OR id::TEXT = p_order_id
  LIMIT 1;

  INSERT INTO public.order_events (order_id, order_source, event_type, from_status, to_status, payload, actor_type, actor_id)
  VALUES (p_order_id, p_order_source, v_evt_type, v_from_status, v_to_status, p_payload, p_actor_type, p_actor_id)
  RETURNING id INTO v_event_id;

  UPDATE public.orders_core SET current_status = v_to_status, updated_at = now() WHERE order_id = p_order_id;
  UPDATE public.orders_food SET order_status = v_to_status, updated_at = now() WHERE core_order_id = p_order_id;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION recalc_order_eta(
  p_order_id TEXT,
  p_order_source TEXT DEFAULT 'orders_core',
  p_trigger_event TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_distance_km NUMERIC(8,2);
  v_eta_seconds INTEGER;
  v_status TEXT;
BEGIN
  SELECT distance_km, current_status INTO v_distance_km, v_status
  FROM public.orders_core
  WHERE order_id = p_order_id OR id::TEXT = p_order_id
  LIMIT 1;

  v_distance_km := COALESCE(v_distance_km, 5);
  v_eta_seconds := 600;

  IF v_status IN ('PREPARING', 'ORDER_RECEIVED', 'ACCEPTED', 'PLACED') THEN
    v_eta_seconds := 900 + (v_distance_km * 180)::INTEGER;
  ELSIF v_status = 'READY_FOR_PICKUP' THEN
    v_eta_seconds := 600 + (v_distance_km * 120)::INTEGER;
  ELSIF v_status IN ('OUT_FOR_DELIVERY', 'in_transit') THEN
    v_eta_seconds := (v_distance_km * 120)::INTEGER;
  END IF;

  INSERT INTO public.order_eta_snapshots (order_id, order_source, eta_seconds, trigger_event, distance_km)
  VALUES (p_order_id, p_order_source, v_eta_seconds, p_trigger_event, v_distance_km);

  RETURN v_eta_seconds;
END;
$$;

COMMENT ON FUNCTION emit_order_event IS 'Append event and update current_status on orders_core/orders_food only; core_orders removed.';
COMMENT ON FUNCTION recalc_order_eta IS 'Append ETA snapshot from orders_core only; core_orders removed.';
