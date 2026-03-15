-- ============================================================================
-- Orders Core: First ETA column (initial/expected delivery time when order accepted)
-- Migration: 0120_orders_core_first_eta
-- ============================================================================

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS first_eta_at TIMESTAMP WITH TIME ZONE NULL;

COMMENT ON COLUMN public.orders_core.first_eta_at IS 'First ETA (expected delivery time) set when order is accepted or first estimated. Used for display (e.g. sidebar "First ETA") and reporting.';

-- Dummy first ETA for first 3 orders: set to created_at + 45 minutes
UPDATE public.orders_core oc
SET first_eta_at = COALESCE(oc.estimated_delivery_time, oc.created_at + INTERVAL '45 minutes'),
    updated_at = now()
WHERE oc.id IN (
  SELECT id FROM public.orders_core ORDER BY id ASC LIMIT 3
);
