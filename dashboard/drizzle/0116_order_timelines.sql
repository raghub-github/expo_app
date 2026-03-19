-- ============================================================================
-- Order Timelines: Immutable event log for every order status change
-- Migration: 0116_order_timelines
-- Each status transition is stored as a new row; never update or delete.
-- status column stores one of the allowed values below (TEXT = any of these).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_timelines (
  id BIGSERIAL NOT NULL,
  order_id BIGINT NOT NULL,
  status TEXT NOT NULL,
  previous_status TEXT NULL,
  actor_type TEXT NOT NULL,
  actor_id BIGINT NULL,
  actor_name TEXT NULL,
  status_message TEXT NULL,
  metadata JSONB NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT order_timelines_pkey PRIMARY KEY (id),
  CONSTRAINT order_timelines_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders_core (id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Allowed status values (stored in status column):
-- Created, Bill Ready, Payment Initiated At, Payment Done, Pymt Assign RX,
-- Accepted, Dispatch Ready, Dispatched, Delivered, Cancelled,
-- RTO Initiated, RTO In Transit, RTO Delivered, RTO Lost
COMMENT ON TABLE public.order_timelines IS 'Immutable event log of order status changes. One row per transition. Never update or delete.';
COMMENT ON COLUMN public.order_timelines.order_id IS 'FK to orders_core.id.';
COMMENT ON COLUMN public.order_timelines.status IS 'Status after this event. Allowed: Created, Bill Ready, Payment Initiated At, Payment Done, Pymt Assign RX, Accepted, Dispatch Ready, Dispatched, Delivered, Cancelled, RTO Initiated, RTO In Transit, RTO Delivered, RTO Lost.';
COMMENT ON COLUMN public.order_timelines.previous_status IS 'Status before this change.';
COMMENT ON COLUMN public.order_timelines.actor_type IS 'Source: admin, rider, store, system, customer, agent.';
COMMENT ON COLUMN public.order_timelines.occurred_at IS 'Exact timestamp of the status change. Immutable.';

CREATE INDEX IF NOT EXISTS order_timelines_order_id_idx ON public.order_timelines USING btree (order_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS order_timelines_occurred_at_idx ON public.order_timelines USING btree (occurred_at) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS order_timelines_order_occurred_idx ON public.order_timelines USING btree (order_id, occurred_at) TABLESPACE pg_default;

-- Trigger: On new order, insert initial "Created" timeline entry.
CREATE OR REPLACE FUNCTION order_timelines_insert_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.order_timelines (order_id, status, previous_status, actor_type, occurred_at)
  VALUES (NEW.id, 'Created', NULL, 'system', NEW.created_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_timelines_after_insert_order ON public.orders_core;
CREATE TRIGGER order_timelines_after_insert_order
  AFTER INSERT ON public.orders_core
  FOR EACH ROW
  EXECUTE PROCEDURE order_timelines_insert_created();
