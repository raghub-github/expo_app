-- Rollback 0535: customer-visible menu requires APPROVED items only.

COMMENT ON COLUMN public.merchant_stores.has_customer_visible_menu IS
  'True when store has ≥1 customer-visible menu item (APPROVED, active, unlocked, in stock).';

CREATE OR REPLACE FUNCTION public.store_has_customer_visible_menu(p_store_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.merchant_menu_items mmi
    LEFT JOIN public.merchant_menu_categories c
      ON c.id = mmi.category_id
     AND c.store_id = mmi.store_id
     AND COALESCE(c.is_deleted, FALSE) = FALSE
    WHERE mmi.store_id = p_store_id
      AND COALESCE(mmi.is_deleted, FALSE) = FALSE
      AND mmi.is_active IS TRUE
      AND mmi.approval_status::text = 'APPROVED'
      AND COALESCE(mmi.is_locked_by_plan, FALSE) = FALSE
      AND NOT (
        COALESCE(mmi.out_of_stock_manual, FALSE) = TRUE
        OR (mmi.out_of_stock_until IS NOT NULL AND mmi.out_of_stock_until > NOW())
        OR (
          (COALESCE(c.out_of_stock_manual, FALSE) = TRUE
            OR (c.out_of_stock_until IS NOT NULL AND c.out_of_stock_until > NOW()))
          AND c.out_of_stock_updated_at IS NOT NULL
          AND mmi.out_of_stock_updated_at IS NOT NULL
          AND c.out_of_stock_updated_at = mmi.out_of_stock_updated_at
        )
        OR (
          COALESCE(mmi.out_of_stock_manual, FALSE) = FALSE
          AND mmi.out_of_stock_until IS NULL
          AND mmi.in_stock IS FALSE
          AND mmi.out_of_stock_updated_at IS NULL
        )
      )
  );
$$;

UPDATE public.merchant_stores ms
SET has_customer_visible_menu = public.store_has_customer_visible_menu(ms.id),
    updated_at = NOW()
WHERE has_customer_visible_menu IS DISTINCT FROM public.store_has_customer_visible_menu(ms.id);
