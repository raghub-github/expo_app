-- Level-2: Kitchen preparation timeline per order.
-- Each step has started_at and optional completed_at; drives ETA and customer UI.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kitchen_step_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
    CREATE TYPE public.kitchen_step_type AS ENUM (
      'ORDER_RECEIVED',
      'PREPARATION_STARTED',
      'COOKING',
      'PACKING',
      'READY_FOR_PICKUP'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.order_kitchen_timeline (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  order_source TEXT NOT NULL DEFAULT 'orders_core',
  step kitchen_step_type NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB,

  CONSTRAINT order_kitchen_timeline_order_source_check CHECK (order_source IN ('core_orders', 'orders_core'))
);

CREATE UNIQUE INDEX IF NOT EXISTS order_kitchen_timeline_order_step_key
  ON public.order_kitchen_timeline(order_id, step);
CREATE INDEX IF NOT EXISTS order_kitchen_timeline_order_id_idx ON public.order_kitchen_timeline(order_id);

COMMENT ON TABLE public.order_kitchen_timeline IS 'Kitchen preparation steps; one row per step per order, event-driven.';
