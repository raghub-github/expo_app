-- =============================================================================
-- 0394_merchant_order_acceptance_auto_cancel_engine.sql
-- Server-authoritative merchant order acceptance deadline + auto-cancel support.
--
-- Runtime engine: backend cron `runOrderAcceptanceTimeoutTick` (every ~10s).
--   - Cancels orders_food where merchant_acceptance_deadline_at < NOW()
--     and order still CREATED/NEW/PLACED with accepted_at IS NULL.
--   - Works when merchant app / partnersite are closed (no client required).
--   - If accepted before deadline → no action.
--
-- Settings source: platform_food_acceptance_settings_by_store_type.acceptance_window_minutes
--   (shown in merchant app + partnersite as "Min" acceptance window).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compute_merchant_acceptance_window_seconds(p_store_id BIGINT)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT GREATEST(
        60,
        LEAST(
          10800,
          GREATEST(1, LEAST(180, COALESCE(p.acceptance_window_minutes, 5))) * 60
        )
      )::int
      FROM public.merchant_stores s
      LEFT JOIN public.platform_food_acceptance_settings_by_store_type p
        ON p.store_type = COALESCE(s.store_type::text, 'GENERAL')
      WHERE s.id = p_store_id
      LIMIT 1
    ),
    300
  );
$$;

COMMENT ON FUNCTION public.compute_merchant_acceptance_window_seconds(BIGINT) IS
  'Acceptance window in seconds from platform food settings (1–180 min, clamped 60s–3h).';

CREATE OR REPLACE FUNCTION public.compute_merchant_acceptance_deadline(
  p_store_id BIGINT,
  p_created_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
  SELECT p_created_at
    + make_interval(
         secs => public.compute_merchant_acceptance_window_seconds(p_store_id)::double precision
       );
$$;

-- Backfill open unaccepted orders missing a deadline (safe to re-run).
UPDATE public.orders_food f
SET
  merchant_acceptance_window_seconds = public.compute_merchant_acceptance_window_seconds(f.merchant_store_id),
  merchant_acceptance_deadline_at = public.compute_merchant_acceptance_deadline(f.merchant_store_id, f.created_at),
  updated_at = NOW()
WHERE f.merchant_acceptance_deadline_at IS NULL
  AND f.merchant_store_id IS NOT NULL
  AND f.accepted_at IS NULL
  AND f.cancelled_at IS NULL
  AND upper(COALESCE(f.order_status, '')) IN ('CREATED', 'NEW', 'PLACED');

-- Cron worker index: expired + still awaiting merchant accept.
CREATE INDEX IF NOT EXISTS idx_orders_food_acceptance_timeout_worker
  ON public.orders_food (merchant_acceptance_deadline_at ASC)
  WHERE cancelled_at IS NULL
    AND accepted_at IS NULL
    AND merchant_acceptance_deadline_at IS NOT NULL
    AND upper(COALESCE(order_status, '')) IN ('CREATED', 'NEW', 'PLACED');

COMMENT ON INDEX public.idx_orders_food_acceptance_timeout_worker IS
  'Backend acceptance-timeout cron: find overdue unaccepted food orders for auto-cancel.';
