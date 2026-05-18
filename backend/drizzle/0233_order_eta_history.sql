-- Append-only audit log of every ETA recalculation event for an order.
-- One row per recalc; the most recent row represents the current LIVE tracking
-- ETA. The frozen PROMISE ETA stays on orders_core and is never overwritten.
--
-- Reasons recorded for each recalc include: 'ORDER_PLACED', 'RIDER_ASSIGNED',
-- 'RIDER_PICKED_UP', 'TRAFFIC_UPDATE', 'WEATHER_UPDATE', 'MERCHANT_DELAY',
-- 'BATCHING_CHANGE', 'MANUAL_OVERRIDE', 'STATUS_CHANGE'.

CREATE TABLE IF NOT EXISTS public.order_eta_history (
  id BIGSERIAL PRIMARY KEY,

  order_id        BIGINT NOT NULL REFERENCES public.orders_core(id) ON DELETE CASCADE,
  order_id_text   TEXT NOT NULL,

  -- Snapshot at the moment of THIS recalc.
  old_eta_min     INTEGER NULL,
  old_eta_max     INTEGER NULL,
  new_eta_min     INTEGER NOT NULL,
  new_eta_max     INTEGER NOT NULL,
  promised_delivery_at TIMESTAMP WITH TIME ZONE NULL,
  new_promised_delivery_at TIMESTAMP WITH TIME ZONE NULL,

  -- Why we recalculated.
  recalc_reason   TEXT NOT NULL,

  -- Per-source delay contribution at this recalc.
  prep_minutes              INTEGER NULL,
  rider_assignment_minutes  INTEGER NULL,
  rider_to_store_minutes    INTEGER NULL,
  store_to_customer_minutes INTEGER NULL,
  traffic_delay_minutes     INTEGER NULL,
  weather_delay_minutes     INTEGER NULL,
  congestion_delay_minutes  INTEGER NULL,
  buffer_minutes            INTEGER NULL,

  -- Linked actors at this snapshot.
  rider_id        BIGINT NULL,
  merchant_store_id BIGINT NULL,

  -- Optional routing + metadata audit.
  route_distance_km NUMERIC(10, 2) NULL,
  route_snapshot  JSONB NULL,
  metadata        JSONB NULL,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_eta_history_order      ON public.order_eta_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_eta_history_order_text ON public.order_eta_history(order_id_text);
CREATE INDEX IF NOT EXISTS idx_order_eta_history_created    ON public.order_eta_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_eta_history_reason     ON public.order_eta_history(recalc_reason);
