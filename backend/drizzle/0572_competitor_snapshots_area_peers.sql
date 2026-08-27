-- Competitor snapshots: when customer-overlap is empty, still list same-city /
-- same-pincode peer stores (affinity 0) so City/Locality toggles show peers.
-- Also record refresh meta so empty results stay "fresh" for 24h.

CREATE TABLE IF NOT EXISTS public.merchant_store_competitor_refresh_meta (
  merchant_store_id BIGINT NOT NULL REFERENCES public.merchant_stores (id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (merchant_store_id, period_key)
);

COMMENT ON TABLE public.merchant_store_competitor_refresh_meta IS
  'Last successful competitor snapshot refresh per store+period (even when 0 rows).';

CREATE OR REPLACE FUNCTION public.refresh_merchant_store_competitor_snapshots(
  p_store_id BIGINT DEFAULT NULL,
  p_match_scope TEXT DEFAULT 'city'
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_scope TEXT;
  v_period_key TEXT;
BEGIN
  v_scope := CASE lower(trim(coalesce(p_match_scope, 'city')))
    WHEN 'locality' THEN 'locality'
    ELSE 'city'
  END;
  v_period_key := '90d_' || v_scope;

  DELETE FROM public.merchant_store_competitor_snapshots s
  WHERE s.period_key = v_period_key
    AND (p_store_id IS NULL OR s.merchant_store_id = p_store_id);

  WITH anchor_stores AS (
    SELECT
      ms.id,
      LOWER(TRIM(ms.city)) AS city_norm,
      NULLIF(regexp_replace(TRIM(COALESCE(ms.postal_code, '')), '[^0-9]', '', 'g'), '') AS pincode_norm,
      ms.city,
      ms.state,
      ms.postal_code
    FROM public.merchant_stores ms
    WHERE ms.deleted_at IS NULL
      AND (p_store_id IS NULL OR ms.id = p_store_id)
      AND (
        (v_scope = 'city' AND ms.city IS NOT NULL AND TRIM(ms.city) <> '')
        OR (v_scope = 'locality' AND NULLIF(regexp_replace(TRIM(COALESCE(ms.postal_code, '')), '[^0-9]', '', 'g'), '') IS NOT NULL)
      )
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
     AND (
       (v_scope = 'city'
         AND LOWER(TRIM(ms.city)) = a.city_norm)
       OR (v_scope = 'locality'
         AND NULLIF(regexp_replace(TRIM(COALESCE(ms.postal_code, '')), '[^0-9]', '', 'g'), '') = a.pincode_norm)
     )
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
  ranked_overlap AS (
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
  ),
  peer_orders AS (
    SELECT oc.merchant_store_id, COUNT(*)::int AS order_count
    FROM public.orders_core oc
    WHERE oc.placed_at >= now() - interval '90 days'
      AND COALESCE(oc.current_status, '') NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
    GROUP BY oc.merchant_store_id
  ),
  area_peers AS (
    SELECT
      lc.anchor_id AS merchant_store_id,
      lc.competitor_id AS competitor_store_id,
      0::int AS shared_customers,
      COALESCE(po.order_count, 0)::int AS peer_orders
    FROM local_competitors lc
    LEFT JOIN peer_orders po ON po.merchant_store_id = lc.competitor_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM ranked_overlap ro
      WHERE ro.merchant_store_id = lc.anchor_id
        AND ro.competitor_store_id = lc.competitor_id
    )
  ),
  overlap_max AS (
    SELECT merchant_store_id, COALESCE(MAX(rank), 0)::int AS max_rank
    FROM ranked_overlap
    GROUP BY merchant_store_id
  ),
  ranked_peers AS (
    SELECT
      ap.merchant_store_id,
      ap.competitor_store_id,
      ap.shared_customers,
      0::numeric AS affinity_pct,
      (
        COALESCE(om.max_rank, 0)
        + ROW_NUMBER() OVER (
            PARTITION BY ap.merchant_store_id
            ORDER BY ap.peer_orders DESC, ap.competitor_store_id ASC
          )
      )::smallint AS rank
    FROM area_peers ap
    LEFT JOIN overlap_max om ON om.merchant_store_id = ap.merchant_store_id
  ),
  ranked AS (
    SELECT
      ro.merchant_store_id,
      ro.competitor_store_id,
      ro.shared_customers,
      ROUND(100.0 * ro.shared_customers::numeric / NULLIF(ro.anchor_customers, 0), 1) AS affinity_pct,
      ro.rank
    FROM ranked_overlap ro
    UNION ALL
    SELECT
      rp.merchant_store_id,
      rp.competitor_store_id,
      rp.shared_customers,
      rp.affinity_pct,
      rp.rank
    FROM ranked_peers rp
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
         v_period_key,
         r.rank,
         r.affinity_pct,
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

  -- Mark refresh complete even when 0 competitor rows (empty city / no peers).
  INSERT INTO public.merchant_store_competitor_refresh_meta (merchant_store_id, period_key, computed_at)
  SELECT a.id, v_period_key, now()
  FROM public.merchant_stores a
  WHERE a.deleted_at IS NULL
    AND (p_store_id IS NULL OR a.id = p_store_id)
  ON CONFLICT (merchant_store_id, period_key)
  DO UPDATE SET computed_at = EXCLUDED.computed_at;
END;
$$;

COMMENT ON FUNCTION public.refresh_merchant_store_competitor_snapshots(BIGINT, TEXT) IS
  'Recompute competitor snapshots: overlap first, then same-city/pincode peers at affinity 0. p_match_scope = city | locality.';
