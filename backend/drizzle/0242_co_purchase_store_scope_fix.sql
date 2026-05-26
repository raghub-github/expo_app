-- Ensure co-purchase stats only include menu items that belong to the order's store.

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
  INNER JOIN public.merchant_menu_items mi1
    ON mi1.id = oci1.menu_item_id
    AND mi1.store_id = oc.merchant_store_id
    AND COALESCE(mi1.is_deleted, FALSE) = FALSE
  INNER JOIN public.merchant_menu_items mi2
    ON mi2.id = oci2.menu_item_id
    AND mi2.store_id = oc.merchant_store_id
    AND COALESCE(mi2.is_deleted, FALSE) = FALSE
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

-- Rebuild stats so stale cross-store rows (if any) are removed.
SELECT public.refresh_merchant_co_purchase_stats(NULL);
