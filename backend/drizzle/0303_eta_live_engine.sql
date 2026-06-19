-- Live ETA engine v3 — dynamic single-minute ETA, merchant delay detection,
-- rider wait tracking, merchant prep reliability, delivery accuracy hooks.
-- Migration: 0303_eta_live_engine

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS promised_eta_minutes INTEGER NULL,
  ADD COLUMN IF NOT EXISTS current_eta_minutes INTEGER NULL,
  ADD COLUMN IF NOT EXISTS expected_ready_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS actual_ready_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reached_store_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS merchant_delayed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS merchant_delay_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchant_delay_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS rider_wait_minutes INTEGER NULL,
  ADD COLUMN IF NOT EXISTS live_eta_updated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS live_promised_delivery_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.orders_core.promised_eta_minutes IS
  'Frozen customer ETA (minutes) shown at order placement — never overwritten.';
COMMENT ON COLUMN public.orders_core.current_eta_minutes IS
  'Single dynamic ETA minutes for customer UI; must stay >= 3 while order is active.';
COMMENT ON COLUMN public.orders_core.expected_ready_at IS
  'When merchant committed the order would be ready (mirror of prep_ready_by_at).';
COMMENT ON COLUMN public.orders_core.merchant_delayed IS
  'Auto-set when now > expected_ready_at and order is not ready for pickup.';
COMMENT ON COLUMN public.orders_core.live_promised_delivery_at IS
  'Live delivery target timestamp; updated on every ETA recalculation.';

UPDATE public.orders_core oc
SET
  promised_eta_minutes = COALESCE(oc.promised_eta_minutes, oc.eta_max_minutes),
  current_eta_minutes = COALESCE(
    oc.current_eta_minutes,
    oc.eta_max_minutes,
    CASE
      WHEN oc.promised_delivery_at IS NOT NULL THEN
        GREATEST(3, CEIL(EXTRACT(EPOCH FROM (oc.promised_delivery_at - NOW())) / 60.0))::INTEGER
      ELSE NULL
    END
  ),
  expected_ready_at = COALESCE(oc.expected_ready_at, oc.prep_ready_by_at),
  live_promised_delivery_at = COALESCE(oc.live_promised_delivery_at, oc.promised_delivery_at)
WHERE oc.order_type = 'food';

UPDATE public.orders_core oc
SET
  actual_ready_at = COALESCE(oc.actual_ready_at, f.prepared_at),
  reached_store_at = COALESCE(oc.reached_store_at, f.rider_reached_pickup_at),
  rider_wait_minutes = CASE
    WHEN f.rider_reached_pickup_at IS NOT NULL
         AND f.prepared_at IS NULL
         AND f.order_status NOT IN ('READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED') THEN
      GREATEST(0, CEIL(EXTRACT(EPOCH FROM (NOW() - f.rider_reached_pickup_at)) / 60.0))::INTEGER
    WHEN f.pickup_wait_seconds IS NOT NULL THEN
      GREATEST(0, CEIL(f.pickup_wait_seconds / 60.0))::INTEGER
    ELSE oc.rider_wait_minutes
  END
FROM public.orders_food f
WHERE f.order_id = oc.id
  AND oc.order_type = 'food';

ALTER TABLE public.merchant_stores
  ADD COLUMN IF NOT EXISTS avg_prep_time_actual_minutes INTEGER NULL,
  ADD COLUMN IF NOT EXISTS prep_delay_pct NUMERIC(5, 2) NULL,
  ADD COLUMN IF NOT EXISTS prep_reliability_score NUMERIC(5, 4) NULL,
  ADD COLUMN IF NOT EXISTS prep_samples_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.merchant_stores.avg_prep_time_actual_minutes IS
  'Rolling average actual prep time (accept → ready) in minutes.';
COMMENT ON COLUMN public.merchant_stores.prep_reliability_score IS
  '0–1 score; higher = merchant meets prep commitments more often.';

CREATE TABLE IF NOT EXISTS public.order_eta_accuracy_snapshots (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders_core(id) ON DELETE CASCADE,
  order_id_text TEXT NOT NULL,
  merchant_store_id BIGINT NULL,
  promised_eta_minutes INTEGER NOT NULL,
  actual_delivery_minutes INTEGER NULL,
  delta_minutes INTEGER NULL,
  merchant_delayed BOOLEAN NOT NULL DEFAULT FALSE,
  merchant_delay_minutes INTEGER NOT NULL DEFAULT 0,
  rider_wait_minutes INTEGER NULL,
  delivered_on_time BOOLEAN NULL,
  delivered_faster_than_promised BOOLEAN NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_eta_accuracy_order_text
  ON public.order_eta_accuracy_snapshots (order_id_text);

CREATE INDEX IF NOT EXISTS idx_order_eta_accuracy_store_created
  ON public.order_eta_accuracy_snapshots (merchant_store_id, created_at DESC)
  WHERE merchant_store_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.order_rider_wait_escalations (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders_core(id) ON DELETE CASCADE,
  order_id_text TEXT NOT NULL,
  merchant_store_id BIGINT NOT NULL,
  rider_id INTEGER NULL,
  wait_minutes INTEGER NOT NULL,
  escalation_level SMALLINT NOT NULL,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, escalation_level)
);

CREATE INDEX IF NOT EXISTS idx_order_rider_wait_esc_order
  ON public.order_rider_wait_escalations (order_id_text);

CREATE INDEX IF NOT EXISTS idx_orders_core_live_eta_active
  ON public.orders_core (live_eta_updated_at)
  WHERE order_type = 'food'
    AND status NOT IN ('delivered', 'cancelled', 'failed');
