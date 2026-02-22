-- Level-2: Order state machine + event queue for real-time status updates.
-- All status changes go through events; consumers (app, rider, kitchen) subscribe or poll.

-- Valid food order status flow (customer-facing):
-- PLACED -> ACCEPTED -> PREPARING -> READY_FOR_PICKUP -> OUT_FOR_DELIVERY -> DELIVERED
-- Any -> CANCELLED

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_event_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
    CREATE TYPE public.order_event_type AS ENUM (
      'PLACED',
      'ACCEPTED',
      'PREPARING',
      'READY_FOR_PICKUP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED',
      'RIDER_ASSIGNED',
      'RIDER_AT_PICKUP',
      'ETA_UPDATED'
    );
  END IF;
END
$$;

COMMENT ON TYPE public.order_event_type IS 'Order lifecycle and tracking events; drives state machine.';

-- Event queue: append-only, one row per status/event.
CREATE TABLE IF NOT EXISTS public.order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  order_source TEXT NOT NULL DEFAULT 'core_orders',
  event_type order_event_type NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  payload JSONB,
  actor_type TEXT,
  actor_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT order_events_order_source_check CHECK (order_source IN ('core_orders', 'orders_core'))
);

-- Ensure event_type exists if table was created earlier (e.g. by ORM) with different columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_events' AND column_name = 'event_type'
  ) THEN
    ALTER TABLE public.order_events ADD COLUMN event_type order_event_type NOT NULL DEFAULT 'PLACED';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS order_events_order_id_created_idx
  ON public.order_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_events_event_type_idx ON public.order_events(event_type);
CREATE INDEX IF NOT EXISTS order_events_created_at_idx ON public.order_events(created_at DESC);

COMMENT ON TABLE public.order_events IS 'Append-only event log for order state; real-time consumers read from here.';

-- Allowed transitions (food flow). Used by app/backend to validate before inserting event.
-- from_status must be NOT NULL (part of PK); use '' for initial -> PLACED.
CREATE TABLE IF NOT EXISTS public.order_status_transitions (
  from_status TEXT NOT NULL DEFAULT '',
  to_status TEXT NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'FOOD',
  PRIMARY KEY (from_status, to_status, order_type)
);

INSERT INTO public.order_status_transitions (from_status, to_status, order_type) VALUES
  ('', 'PLACED', 'FOOD'),
  ('PLACED', 'ACCEPTED', 'FOOD'),
  ('PLACED', 'CANCELLED', 'FOOD'),
  ('ACCEPTED', 'PREPARING', 'FOOD'),
  ('ACCEPTED', 'CANCELLED', 'FOOD'),
  ('PREPARING', 'READY_FOR_PICKUP', 'FOOD'),
  ('PREPARING', 'CANCELLED', 'FOOD'),
  ('READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'FOOD'),
  ('READY_FOR_PICKUP', 'CANCELLED', 'FOOD'),
  ('OUT_FOR_DELIVERY', 'DELIVERED', 'FOOD'),
  ('OUT_FOR_DELIVERY', 'CANCELLED', 'FOOD')
ON CONFLICT (from_status, to_status, order_type) DO NOTHING;

-- Function: emit order event and update current_status on core_orders / orders_food.
CREATE OR REPLACE FUNCTION emit_order_event(
  p_order_id TEXT,
  p_order_source TEXT DEFAULT 'core_orders',
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

  IF p_order_source = 'core_orders' THEN
    SELECT current_status INTO v_from_status FROM public.core_orders WHERE order_id = p_order_id LIMIT 1;
  ELSE
    SELECT current_status INTO v_from_status FROM public.orders_core
    WHERE id::TEXT = p_order_id OR formatted_order_id = p_order_id LIMIT 1;
  END IF;

  INSERT INTO public.order_events (order_id, order_source, event_type, from_status, to_status, payload, actor_type, actor_id)
  VALUES (p_order_id, p_order_source, v_evt_type, v_from_status, v_to_status, p_payload, p_actor_type, p_actor_id)
  RETURNING id INTO v_event_id;

  IF p_order_source = 'core_orders' THEN
    UPDATE public.core_orders SET current_status = v_to_status, updated_at = now() WHERE order_id = p_order_id;
    UPDATE public.orders_food SET order_status = v_to_status, updated_at = now() WHERE core_order_id = p_order_id;
  END IF;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION emit_order_event IS 'Append event and update current_status; call after validating transition.';

-- Emit PLACED when a new core order is inserted.
CREATE OR REPLACE FUNCTION trigger_emit_placed_on_core_order()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.order_events (order_id, order_source, event_type, from_status, to_status)
  VALUES (NEW.order_id, 'core_orders', 'PLACED', NULL, COALESCE(NEW.current_status, 'PLACED'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_core_order_insert_emit_placed ON public.core_orders;
CREATE TRIGGER after_core_order_insert_emit_placed
  AFTER INSERT ON public.core_orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_emit_placed_on_core_order();
