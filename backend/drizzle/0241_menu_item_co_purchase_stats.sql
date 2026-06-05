-- Pre-aggregated menu item co-purchase stats for fast "Most ordered together" recommendations.
-- Refresh via refresh_merchant_co_purchase_stats() after order volume grows (cron / manual).

CREATE TABLE IF NOT EXISTS public.merchant_menu_item_co_purchases (
  id BIGSERIAL PRIMARY KEY,
  merchant_store_id BIGINT NOT NULL REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  anchor_menu_item_id BIGINT NOT NULL REFERENCES public.merchant_menu_items(id) ON DELETE CASCADE,
  paired_menu_item_id BIGINT NOT NULL REFERENCES public.merchant_menu_items(id) ON DELETE CASCADE,
  co_order_count INT NOT NULL DEFAULT 0 CHECK (co_order_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_menu_item_co_purchases_unique
    UNIQUE (merchant_store_id, anchor_menu_item_id, paired_menu_item_id),
  CONSTRAINT merchant_menu_item_co_purchases_no_self
    CHECK (anchor_menu_item_id <> paired_menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_co_purchase_store_anchor_count
  ON public.merchant_menu_item_co_purchases (merchant_store_id, anchor_menu_item_id, co_order_count DESC);

CREATE INDEX IF NOT EXISTS idx_co_purchase_store_pair_count
  ON public.merchant_menu_item_co_purchases (merchant_store_id, co_order_count DESC);

CREATE INDEX IF NOT EXISTS idx_orders_core_items_menu_item_order
  ON public.orders_core_items (menu_item_id, order_id);

COMMENT ON TABLE public.merchant_menu_item_co_purchases IS
  'Directional co-purchase counts: anchor item -> paired item in same non-cancelled order.';

CREATE OR REPLACE FUNCTION public.refresh_merchant_co_purchase_stats(p_store_id BIGINT DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  inserted INT;
BEGIN
  DELETE FROM public.merchant_menu_item_co_purchases
  WHERE p_store_id IS NULL OR merchant_store_id = p_store_id;

  INSERT INTO public.merchant_menu_item_co_purchases (
    merchant_store_id,
    anchor_menu_item_id,
    paired_menu_item_id,
    co_order_count,
    updated_at
  )
  SELECT
    oc.merchant_store_id,
    oci1.menu_item_id AS anchor_menu_item_id,
    oci2.menu_item_id AS paired_menu_item_id,
    COUNT(DISTINCT oci1.order_id)::INT AS co_order_count,
    NOW()
  FROM public.orders_core_items oci1
  INNER JOIN public.orders_core_items oci2
    ON oci1.order_id = oci2.order_id
    AND oci1.menu_item_id <> oci2.menu_item_id
  INNER JOIN public.orders_core oc
    ON oc.order_id = oci1.order_id
  WHERE oc.status IS DISTINCT FROM 'cancelled'
    AND oci1.menu_item_id IS NOT NULL
    AND oci2.menu_item_id IS NOT NULL
    AND (p_store_id IS NULL OR oc.merchant_store_id = p_store_id)
  GROUP BY oc.merchant_store_id, oci1.menu_item_id, oci2.menu_item_id
  HAVING COUNT(DISTINCT oci1.order_id) >= 2;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

COMMENT ON FUNCTION public.refresh_merchant_co_purchase_stats(BIGINT) IS
  'Rebuild co-purchase stats from orders_core_items. Pass store id or NULL for all stores.';

-- Initial population (safe to re-run via ON CONFLICT-free delete+insert pattern above)
SELECT public.refresh_merchant_co_purchase_stats(NULL);
