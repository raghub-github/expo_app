-- Rider cancellation-analytics: supporting indexes only. No schema or data changes —
-- all source data already exists (order_rider_assignments, orders_core,
-- order_cancellation_reasons, order_cancellation_reason_catalog).
--
-- The dashboard endpoint GET /api/riders/:id/cancellation-analytics filters
-- order_rider_assignments by (rider_id, accepted_at NOT NULL) then joins orders_core.
-- These partial/composite indexes keep that per-rider aggregation fast.

-- Accepted assignments per rider, ordered by acceptance time (the reporting anchor).
CREATE INDEX IF NOT EXISTS order_rider_assignments_rider_accepted_idx
  ON public.order_rider_assignments (rider_id, accepted_at)
  WHERE accepted_at IS NOT NULL;

-- Cancellation-reason lookup by order (LATERAL "latest reason" subquery).
CREATE INDEX IF NOT EXISTS order_cancellation_reasons_order_created_idx
  ON public.order_cancellation_reasons (order_id, created_at DESC);

-- Terminal-state attribution: orders owned by a rider, filtered on cancellation.
CREATE INDEX IF NOT EXISTS orders_core_rider_status_cancelled_idx
  ON public.orders_core (rider_id, status)
  WHERE cancelled_at IS NOT NULL;
