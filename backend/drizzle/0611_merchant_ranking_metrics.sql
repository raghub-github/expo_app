-- Phase A of the food store ranking engine: pre-aggregated per-store ranking metrics.
--
-- Why: ranking must NEVER compute historical aggregates per customer request (§32). A scheduled
-- worker refreshes this one-row-per-store table from existing orders / ratings; the request-path
-- feature resolver reads it with a single `WHERE store_id = ANY(...)` (no N+1).
--
-- I/O-safe / idempotent:
--   • Single transaction, CREATE TABLE IF NOT EXISTS — re-runnable, additive, non-destructive.
--   • PRIMARY KEY (store_id) is the only index needed (the batched read is a PK ANY() lookup).
--   • No change to any existing table; nothing here affects pricing, dispatch, or serviceability.

BEGIN;

CREATE TABLE IF NOT EXISTS merchant_ranking_metrics (
  store_id             bigint PRIMARY KEY,

  -- Velocity / popularity (delivered food orders in the window; already the "success" count).
  orders_7d            integer NOT NULL DEFAULT 0,
  orders_30d           integer NOT NULL DEFAULT 0,

  -- Denominators + negative-experience counts (30-day window).
  total_orders_30d     integer NOT NULL DEFAULT 0,
  merchant_cancel_30d  integer NOT NULL DEFAULT 0,
  cancellation_rate    numeric(6, 4) NOT NULL DEFAULT 0,
  refund_30d           integer NOT NULL DEFAULT 0,
  refund_rate          numeric(6, 4) NOT NULL DEFAULT 0,
  complaint_30d        integer NOT NULL DEFAULT 0,
  complaint_rate       numeric(6, 4) NOT NULL DEFAULT 0,

  -- Rating (all-time; the engine applies Bayesian confidence — few reviews can't dominate).
  avg_rating           numeric(3, 2) NOT NULL DEFAULT 0,
  rating_count         integer NOT NULL DEFAULT 0,

  -- Preparation / delivery timing medians (minutes) over the window; NULL ⇒ engine treats neutral.
  kpt_expected_min     numeric(6, 2),
  kpt_actual_min       numeric(6, 2),
  eta_actual_min       numeric(6, 2),

  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE merchant_ranking_metrics IS
  'Pre-aggregated per-store food ranking signals (refreshed by a scheduled worker). Read on the request path with a single ANY(store_id) lookup; never aggregated per request.';

COMMIT;
