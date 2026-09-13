-- Rider cancellation-analytics: supporting indexes only. No schema or data changes —
-- all source data already exists (order_rider_assignments, orders_core,
-- order_rider_dispatch_exclusions, order_cancellation_reasons,
-- order_cancellation_reason_catalog).
--
-- The dashboard endpoint GET /api/riders/:id/cancellation-analytics drives off
-- order_rider_assignments filtered by (rider_id, accepted_at NOT NULL), then joins
-- orders_core, the dispatch-exclusion reason and the cancellation reason.
-- (order_rider_dispatch_exclusions already has UNIQUE(order_core_id, rider_id);
--  order_cancellation_reason_catalog.reason_code is already UNIQUE.)

-- Accepted assignments per rider, ordered by acceptance time (the reporting anchor).
CREATE INDEX IF NOT EXISTS order_rider_assignments_rider_accepted_idx
  ON public.order_rider_assignments (rider_id, accepted_at)
  WHERE accepted_at IS NOT NULL;

-- Cancellation-reason lookup by order (LATERAL "latest reason" subquery).
CREATE INDEX IF NOT EXISTS order_cancellation_reasons_order_created_idx
  ON public.order_cancellation_reasons (order_id, created_at DESC);
