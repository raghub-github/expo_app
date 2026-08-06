-- 0487 · Durable per-item refund lines for partial / item-targeted refunds.
-- Full cancel @ 100% does not write item rows. Partial % and refund-without-cancel do.

CREATE TABLE IF NOT EXISTS public.order_refund_items (
  id bigserial PRIMARY KEY,
  order_refund_id bigint NOT NULL REFERENCES public.order_refunds (id) ON DELETE CASCADE,
  order_id bigint NOT NULL REFERENCES public.orders_core (id) ON DELETE CASCADE,
  order_item_id bigint NOT NULL,
  item_name text NOT NULL DEFAULT '',
  refund_amount numeric(12, 2) NOT NULL CHECK (refund_amount > 0),
  refund_percentage numeric(6, 2) NULL,
  original_total numeric(12, 2) NULL,
  selected_quantity numeric(10, 2) NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_refund_items_order_id_idx
  ON public.order_refund_items (order_id);
CREATE INDEX IF NOT EXISTS order_refund_items_refund_id_idx
  ON public.order_refund_items (order_refund_id);
CREATE INDEX IF NOT EXISTS order_refund_items_item_id_idx
  ON public.order_refund_items (order_item_id);

COMMENT ON TABLE public.order_refund_items IS
  'Item-level refund attribution. Populated for refund_without_cancellation and for refund_with_cancellation when customer refund % < 100.';

-- Backfill from refund_metadata.refundItems (item-targeted refunds).
INSERT INTO public.order_refund_items (
  order_refund_id, order_id, order_item_id, item_name,
  refund_amount, refund_percentage, original_total, selected_quantity, created_at
)
SELECT
  r.id,
  r.order_id,
  (elem->>'id')::bigint,
  COALESCE(NULLIF(BTRIM(elem->>'name'), ''), 'Item #' || (elem->>'id')),
  ROUND((elem->>'amount')::numeric, 2),
  NULLIF(elem->>'refundPercentage', '')::numeric,
  NULLIF(elem->>'originalTotal', '')::numeric,
  NULLIF(elem->>'selectedQuantity', '')::numeric,
  r.created_at
FROM public.order_refunds r
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(COALESCE(r.refund_metadata->'refundItems', '[]'::jsonb)) = 'array'
      THEN COALESCE(r.refund_metadata->'refundItems', '[]'::jsonb)
    ELSE '[]'::jsonb
  END
) AS elem
WHERE LOWER(COALESCE(r.refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
  AND UPPER(COALESCE(r.execution_status, '')) IS DISTINCT FROM 'FAILED'
  AND (elem->>'id') ~ '^[0-9]+$'
  AND COALESCE((elem->>'amount')::numeric, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.order_refund_items ori
    WHERE ori.order_refund_id = r.id AND ori.order_item_id = (elem->>'id')::bigint
  );

-- Backfill partial cancel refunds (refundPercentage < 100, no refundItems):
-- attribute share of refund to each line by item weight / order CTC.
WITH partial_cancels AS (
  SELECT
    r.id AS refund_id,
    r.order_id,
    r.created_at,
    r.refund_amount::numeric AS refund_amount,
    COALESCE(NULLIF(r.refund_metadata->>'refundPercentage', '')::numeric, NULL) AS pct,
    COALESCE(NULLIF(r.refund_metadata->>'ctcTotal', '')::numeric, NULL) AS ctc_total,
    COALESCE(r.refund_metadata->>'refundTypeUI', '') AS refund_type_ui
  FROM public.order_refunds r
  WHERE LOWER(COALESCE(r.refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
    AND UPPER(COALESCE(r.execution_status, '')) IS DISTINCT FROM 'FAILED'
    AND COALESCE(r.refund_metadata->>'refundTypeUI', '') = 'refund_with_cancellation'
    AND COALESCE(NULLIF(r.refund_metadata->>'refundPercentage', '')::numeric, 100) < 100
    AND (
      r.refund_metadata->'refundItems' IS NULL
      OR jsonb_typeof(r.refund_metadata->'refundItems') <> 'array'
      OR jsonb_array_length(COALESCE(r.refund_metadata->'refundItems', '[]'::jsonb)) = 0
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.order_refund_items ori WHERE ori.order_refund_id = r.id
    )
),
order_lines AS (
  SELECT
    oc.id AS order_pk,
    oci.id::bigint AS item_id,
    COALESCE(NULLIF(BTRIM(oci.item_name), ''), 'Item') AS item_name,
    GREATEST(
      COALESCE(oci.effective_line_total, oci.total_price, 0)::numeric,
      0.01
    ) AS line_weight
  FROM public.orders_core oc
  JOIN public.orders_core_items oci ON oci.order_id = oc.order_id
),
weighted AS (
  SELECT
    pc.refund_id,
    pc.order_id,
    pc.created_at,
    pc.refund_amount,
    pc.pct,
    pc.ctc_total,
    ol.item_id,
    ol.item_name,
    ol.line_weight,
    SUM(ol.line_weight) OVER (PARTITION BY pc.refund_id) AS weight_sum
  FROM partial_cancels pc
  JOIN order_lines ol ON ol.order_pk = pc.order_id
)
INSERT INTO public.order_refund_items (
  order_refund_id, order_id, order_item_id, item_name,
  refund_amount, refund_percentage, original_total, created_at
)
SELECT
  w.refund_id,
  w.order_id,
  w.item_id,
  w.item_name,
  ROUND(
    CASE
      WHEN w.pct IS NOT NULL AND w.pct > 0 AND w.pct < 100
        THEN w.line_weight * (w.pct / 100.0)
      WHEN w.ctc_total IS NOT NULL AND w.ctc_total > 0
        THEN w.refund_amount * (w.line_weight / w.ctc_total)
      WHEN w.weight_sum > 0
        THEN w.refund_amount * (w.line_weight / w.weight_sum)
      ELSE w.refund_amount
    END
  , 2),
  w.pct,
  ROUND(w.line_weight, 2),
  w.created_at
FROM weighted w
WHERE ROUND(
  CASE
    WHEN w.pct IS NOT NULL AND w.pct > 0 AND w.pct < 100
      THEN w.line_weight * (w.pct / 100.0)
    WHEN w.ctc_total IS NOT NULL AND w.ctc_total > 0
      THEN w.refund_amount * (w.line_weight / w.ctc_total)
    WHEN w.weight_sum > 0
      THEN w.refund_amount * (w.line_weight / w.weight_sum)
    ELSE w.refund_amount
  END
, 2) > 0;
