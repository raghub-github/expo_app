-- Customer-overlap competitor rankings per store (affinity %), refreshed from orders_core.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.merchant_store_competitor_snapshots (
  id BIGSERIAL PRIMARY KEY,
  merchant_store_id BIGINT NOT NULL REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  competitor_store_id BIGINT NOT NULL REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL DEFAULT '90d',
  rank SMALLINT NOT NULL,
  affinity_pct NUMERIC(6, 2) NOT NULL DEFAULT 0,
  shared_customers INTEGER NOT NULL DEFAULT 0,
  rank_delta SMALLINT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT merchant_store_competitor_snapshots_unique
    UNIQUE (merchant_store_id, competitor_store_id, period_key),
  CONSTRAINT merchant_store_competitor_snapshots_no_self
    CHECK (merchant_store_id <> competitor_store_id)
);

CREATE INDEX IF NOT EXISTS idx_merchant_store_competitor_snapshots_store_rank
  ON public.merchant_store_competitor_snapshots (merchant_store_id, period_key, rank);

COMMENT ON TABLE public.merchant_store_competitor_snapshots IS
  'Ranked competitor stores by shared-customer affinity (last 90d vs prior 90d rank_delta).';

CREATE OR REPLACE FUNCTION public.refresh_merchant_store_competitor_snapshots(p_store_id BIGINT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.merchant_store_competitor_snapshots s
  WHERE p_store_id IS NULL OR s.merchant_store_id = p_store_id;

  WITH anchor_stores AS (
    SELECT ms.id, LOWER(TRIM(ms.city)) AS city_norm, ms.city, ms.state, ms.postal_code
    FROM public.merchant_stores ms
    WHERE ms.deleted_at IS NULL
      AND ms.city IS NOT NULL
      AND TRIM(ms.city) <> ''
      AND (p_store_id IS NULL OR ms.id = p_store_id)
  ),
  periods AS (
    SELECT 'current'::text AS label,
           now() - interval '90 days' AS start_at,
           now() AS end_at
    UNION ALL
    SELECT 'prior'::text,
           now() - interval '180 days',
           now() - interval '90 days'
  ),
  anchor_customers AS (
    SELECT a.id AS merchant_store_id, p.label AS period_label, oc.customer_id
    FROM anchor_stores a
    CROSS JOIN periods p
    JOIN public.orders_core oc
      ON oc.merchant_store_id = a.id
     AND oc.customer_id IS NOT NULL
     AND oc.placed_at >= p.start_at
     AND oc.placed_at < p.end_at
     AND COALESCE(oc.current_status, '') NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
    GROUP BY a.id, p.label, oc.customer_id
  ),
  anchor_counts AS (
    SELECT merchant_store_id, period_label, COUNT(*)::int AS customer_count
    FROM anchor_customers
    GROUP BY merchant_store_id, period_label
  ),
  local_competitors AS (
    SELECT a.id AS anchor_id, ms.id AS competitor_id
    FROM anchor_stores a
    JOIN public.merchant_stores ms
      ON ms.id <> a.id
     AND ms.deleted_at IS NULL
     AND LOWER(TRIM(ms.city)) = a.city_norm
  ),
  overlap AS (
    SELECT lc.anchor_id AS merchant_store_id,
           lc.competitor_id AS competitor_store_id,
           ac.period_label,
           COUNT(DISTINCT oc.customer_id)::int AS shared_customers
    FROM local_competitors lc
    JOIN anchor_customers ac
      ON ac.merchant_store_id = lc.anchor_id
    JOIN public.orders_core oc
      ON oc.merchant_store_id = lc.competitor_id
     AND oc.customer_id = ac.customer_id
     AND oc.placed_at >= CASE ac.period_label
           WHEN 'current' THEN now() - interval '90 days'
           ELSE now() - interval '180 days'
         END
     AND oc.placed_at < CASE ac.period_label
           WHEN 'current' THEN now()
           ELSE now() - interval '90 days'
         END
     AND COALESCE(oc.current_status, '') NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
    GROUP BY lc.anchor_id, lc.competitor_id, ac.period_label
  ),
  ranked AS (
    SELECT o.merchant_store_id,
           o.competitor_store_id,
           o.period_label,
           o.shared_customers,
           ac.customer_count AS anchor_customers,
           ROW_NUMBER() OVER (
             PARTITION BY o.merchant_store_id, o.period_label
             ORDER BY
               CASE WHEN ac.customer_count > 0
                 THEN o.shared_customers::numeric / ac.customer_count
                 ELSE 0
               END DESC,
               o.shared_customers DESC
           )::smallint AS rank
    FROM overlap o
    JOIN anchor_counts ac
      ON ac.merchant_store_id = o.merchant_store_id
     AND ac.period_label = o.period_label
    WHERE o.period_label = 'current'
      AND ac.customer_count > 0
  ),
  prior_rank AS (
    SELECT o.merchant_store_id,
           o.competitor_store_id,
           ROW_NUMBER() OVER (
             PARTITION BY o.merchant_store_id
             ORDER BY
               CASE WHEN ac.customer_count > 0
                 THEN o.shared_customers::numeric / ac.customer_count
                 ELSE 0
               END DESC,
               o.shared_customers DESC
           )::smallint AS rank
    FROM overlap o
    JOIN anchor_counts ac
      ON ac.merchant_store_id = o.merchant_store_id
     AND ac.period_label = o.period_label
    WHERE o.period_label = 'prior'
      AND ac.customer_count > 0
  )
  INSERT INTO public.merchant_store_competitor_snapshots (
    merchant_store_id,
    competitor_store_id,
    period_key,
    rank,
    affinity_pct,
    shared_customers,
    rank_delta,
    computed_at
  )
  SELECT r.merchant_store_id,
         r.competitor_store_id,
         '90d',
         r.rank,
         ROUND(100.0 * r.shared_customers::numeric / NULLIF(r.anchor_customers, 0), 1),
         r.shared_customers,
         CASE
           WHEN pr.rank IS NULL THEN NULL
           ELSE (pr.rank - r.rank)::smallint
         END,
         now()
  FROM ranked r
  LEFT JOIN prior_rank pr
    ON pr.merchant_store_id = r.merchant_store_id
   AND pr.competitor_store_id = r.competitor_store_id
  ON CONFLICT (merchant_store_id, competitor_store_id, period_key)
  DO UPDATE SET
    rank = EXCLUDED.rank,
    affinity_pct = EXCLUDED.affinity_pct,
    shared_customers = EXCLUDED.shared_customers,
    rank_delta = EXCLUDED.rank_delta,
    computed_at = EXCLUDED.computed_at;
END;
$$;

COMMENT ON FUNCTION public.refresh_merchant_store_competitor_snapshots(BIGINT) IS
  'Recompute competitor affinity snapshots from orders_core (same-city stores, 90d window).';
