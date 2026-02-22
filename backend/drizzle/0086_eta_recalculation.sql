-- Level-2: Auto ETA recalculation engine.
-- Stores ETA snapshots per order; recalculated on status change, rider assign, or position update.

CREATE TABLE IF NOT EXISTS public.order_eta_snapshots (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  order_source TEXT NOT NULL DEFAULT 'core_orders',
  eta_seconds INTEGER NOT NULL,
  eta_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger_event TEXT,
  distance_km NUMERIC(8, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT order_eta_snapshots_order_source_check CHECK (order_source IN ('core_orders', 'orders_core'))
);

CREATE INDEX IF NOT EXISTS order_eta_snapshots_order_id_created_idx
  ON public.order_eta_snapshots(order_id, created_at DESC);

COMMENT ON TABLE public.order_eta_snapshots IS 'ETA history; latest row per order = current ETA.';

-- Recalculate ETA: simple model (distance-based + prep buffer).
-- Call from trigger on order_events or from rider position update.
CREATE OR REPLACE FUNCTION recalc_order_eta(
  p_order_id TEXT,
  p_order_source TEXT DEFAULT 'core_orders',
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
  IF p_order_source = 'core_orders' THEN
    SELECT distance_km, current_status INTO v_distance_km, v_status
    FROM public.core_orders WHERE order_id = p_order_id LIMIT 1;
  ELSE
    SELECT distance_km, current_status INTO v_distance_km, v_status
    FROM public.orders_core WHERE id::TEXT = p_order_id OR formatted_order_id = p_order_id LIMIT 1;
  END IF;

  v_distance_km := COALESCE(v_distance_km, 5);
  v_eta_seconds := 600;

  IF v_status IN ('PREPARING', 'ORDER_RECEIVED', 'ACCEPTED') THEN
    v_eta_seconds := 900 + (v_distance_km * 180)::INTEGER;
  ELSIF v_status = 'READY_FOR_PICKUP' THEN
    v_eta_seconds := 300 + (v_distance_km * 180)::INTEGER;
  ELSIF v_status = 'OUT_FOR_DELIVERY' THEN
    v_eta_seconds := (v_distance_km * 180)::INTEGER;
  ELSIF v_status = 'DELIVERED' THEN
    v_eta_seconds := 0;
  END IF;

  INSERT INTO public.order_eta_snapshots (order_id, order_source, eta_seconds, trigger_event, distance_km)
  VALUES (p_order_id, p_order_source, v_eta_seconds, p_trigger_event, v_distance_km);

  RETURN v_eta_seconds;
END;
$$;

COMMENT ON FUNCTION recalc_order_eta IS 'Append ETA snapshot; call on status change or rider update.';

-- Trigger: after order_events insert, recalc ETA.
CREATE OR REPLACE FUNCTION trigger_recalc_eta_on_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM recalc_order_eta(NEW.order_id, NEW.order_source, NEW.to_status);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_order_event_recalc_eta ON public.order_events;
CREATE TRIGGER after_order_event_recalc_eta
  AFTER INSERT ON public.order_events
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalc_eta_on_event();
