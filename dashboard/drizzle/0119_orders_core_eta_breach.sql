-- ============================================================================
-- Orders Core: ETA breach tracking for timeline "ETA breached" tag
-- Migration: 0119_orders_core_eta_breach
-- Stores when ETA was first breached and which timeline stage was current.
-- Mins elapsed (e.g. "X mins past ETA") is computed at display time:
--   current_time, order.estimated_delivery_time (or created_at + eta_seconds).
-- ============================================================================

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS eta_breached_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS eta_breached_timeline_id BIGINT NULL;

COMMENT ON COLUMN public.orders_core.eta_breached_at IS 'When ETA was first breached (current_time > expected delivery). Set once when order is still in progress and now() > estimated_delivery_time. Used for ETA breached tag and reporting.';
COMMENT ON COLUMN public.orders_core.eta_breached_timeline_id IS 'order_timelines.id of the stage that was current when ETA was first breached. Red dot on timeline shows this stage.';

-- FK: optional, so we can identify which timeline entry was active at breach
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_core_eta_breached_timeline_id_fkey'
      AND table_schema = 'public'
      AND table_name = 'orders_core'
  ) THEN
    ALTER TABLE public.orders_core
      ADD CONSTRAINT orders_core_eta_breached_timeline_id_fkey
      FOREIGN KEY (eta_breached_timeline_id) REFERENCES public.order_timelines (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_core_eta_breached_at_idx
  ON public.orders_core USING btree (eta_breached_at) TABLESPACE pg_default
  WHERE (eta_breached_at IS NOT NULL);
