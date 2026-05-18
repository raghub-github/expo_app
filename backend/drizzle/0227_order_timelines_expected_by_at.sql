-- 0227: Align order_timelines with production schema (expected_by_at) and document placement statuses.
-- Placement flow (customer app): Created (trigger) → Bill Ready → Payment Initiated At → Pymt Assign RX
-- Applied by backend recordPlacementTimelines() after orders_core INSERT on finalize/webhook.

ALTER TABLE public.order_timelines
  ADD COLUMN IF NOT EXISTS expected_by_at TIMESTAMP WITH TIME ZONE NULL;

COMMENT ON COLUMN public.order_timelines.expected_by_at IS
  'Optional SLA / expected completion time for this status step.';

COMMENT ON TABLE public.order_timelines IS
  'Immutable event log of order status changes. Placement: Created, Bill Ready, Payment Initiated At, Pymt Assign RX.';
