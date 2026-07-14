-- 0408: Repair offer type corruption + restore menu_item_ids for edit hydration.
-- Backward compatible. Does not drop columns.
--
-- Fixes from 0407 / client bugs:
-- 1) BOGO rows stamped with conditions_mode='boost' → strip mode, set create_path='bogo'
-- 2) menu_item_ids missing from offer_metadata but present in merchant_offer_applicability → backfill
-- 3) offer_sub_type ALL_ORDERS while items exist → SPECIFIC_ITEM
-- 4) Persist create_path from conditions_mode where missing (boost/precision)
-- 5) Re-sync applicability from repaired metadata

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) BOGO: never carry Boost/Precision conditions_mode
-- ----------------------------------------------------------------------------
UPDATE public.merchant_offers o
SET
  offer_metadata = (
    COALESCE(o.offer_metadata, '{}'::jsonb)
    - 'conditions_mode'
  ) || jsonb_build_object('create_path', 'bogo'),
  updated_at = NOW()
WHERE o.offer_type IN ('BOGO', 'BUY_X_GET_Y', 'BUY_N_GET_M');

-- ----------------------------------------------------------------------------
-- 2) Backfill menu_item_ids from applicability → metadata (public item_id preferred)
-- ----------------------------------------------------------------------------
UPDATE public.merchant_offers o
SET
  offer_metadata = jsonb_set(
    COALESCE(o.offer_metadata, '{}'::jsonb),
    '{menu_item_ids}',
    COALESCE(
      (
        SELECT jsonb_agg(DISTINCT to_jsonb(x.item_key))
        FROM (
          SELECT COALESCE(NULLIF(trim(m.item_id), ''), a.menu_item_id::text) AS item_key
          FROM public.merchant_offer_applicability a
          LEFT JOIN public.merchant_menu_items m ON m.id = a.menu_item_id
          WHERE a.offer_id = o.id
            AND a.menu_item_id IS NOT NULL
        ) x
        WHERE x.item_key IS NOT NULL AND trim(x.item_key) <> ''
      ),
      '[]'::jsonb
    ),
    true
  ),
  updated_at = NOW()
WHERE EXISTS (
  SELECT 1
  FROM public.merchant_offer_applicability a
  WHERE a.offer_id = o.id
    AND a.menu_item_id IS NOT NULL
)
AND (
  o.offer_metadata IS NULL
  OR jsonb_typeof(COALESCE(o.offer_metadata, '{}'::jsonb)->'menu_item_ids') IS DISTINCT FROM 'array'
  OR jsonb_array_length(COALESCE(o.offer_metadata->'menu_item_ids', '[]'::jsonb)) = 0
)
AND lower(COALESCE(o.offer_metadata->>'conditions_mode', '')) IS DISTINCT FROM 'precision';

-- ----------------------------------------------------------------------------
-- 3) Align offer_sub_type when items are mapped
-- ----------------------------------------------------------------------------
UPDATE public.merchant_offers o
SET
  offer_sub_type = 'SPECIFIC_ITEM',
  updated_at = NOW()
WHERE o.offer_type IN ('PERCENTAGE', 'FLAT', 'COUPON', 'BOGO', 'BUY_X_GET_Y', 'BUY_N_GET_M')
  AND lower(COALESCE(o.offer_metadata->>'conditions_mode', '')) IS DISTINCT FROM 'precision'
  AND (
    (
      jsonb_typeof(COALESCE(o.offer_metadata, '{}'::jsonb)->'menu_item_ids') = 'array'
      AND jsonb_array_length(COALESCE(o.offer_metadata, '{}'::jsonb)->'menu_item_ids') > 0
    )
    OR EXISTS (
      SELECT 1
      FROM public.merchant_offer_applicability a
      WHERE a.offer_id = o.id
        AND a.menu_item_id IS NOT NULL
    )
  )
  AND upper(COALESCE(o.offer_sub_type, '')) IN ('ALL_ORDERS', 'ALL', '');

-- ----------------------------------------------------------------------------
-- 4) Stamp create_path for %/flat from conditions_mode (durable type label)
-- ----------------------------------------------------------------------------
UPDATE public.merchant_offers o
SET
  offer_metadata = jsonb_set(
    COALESCE(o.offer_metadata, '{}'::jsonb),
    '{create_path}',
    to_jsonb(
      CASE
        WHEN lower(COALESCE(o.offer_metadata->>'conditions_mode', '')) = 'precision' THEN 'precision'
        WHEN (
          jsonb_typeof(COALESCE(o.offer_metadata, '{}'::jsonb)->'menu_item_ids') = 'array'
          AND jsonb_array_length(COALESCE(o.offer_metadata, '{}'::jsonb)->'menu_item_ids') > 0
        )
          OR upper(COALESCE(o.offer_sub_type, '')) IN (
            'SPECIFIC_ITEM', 'SPECIFIC_ITEMS', 'SELECTED_ITEM', 'SELECTED_ITEMS'
          )
        THEN 'boost'
        WHEN lower(COALESCE(o.offer_metadata->>'conditions_mode', '')) = 'boost' THEN 'boost'
        ELSE 'precision'
      END
    ),
    true
  ),
  updated_at = NOW()
WHERE o.offer_type IN ('PERCENTAGE', 'FLAT', 'COUPON', 'CART_PERCENTAGE', 'CART_FLAT')
  AND (
    o.offer_metadata IS NULL
    OR o.offer_metadata->>'create_path' IS NULL
    OR trim(COALESCE(o.offer_metadata->>'create_path', '')) = ''
  );

-- Keep conditions_mode aligned with create_path for %/flat (not BOGO).
UPDATE public.merchant_offers o
SET
  offer_metadata = jsonb_set(
    COALESCE(o.offer_metadata, '{}'::jsonb),
    '{conditions_mode}',
    to_jsonb(
      CASE
        WHEN o.offer_metadata->>'create_path' = 'precision' THEN 'precision'
        ELSE 'boost'
      END
    ),
    true
  ),
  updated_at = NOW()
WHERE o.offer_type IN ('PERCENTAGE', 'FLAT', 'COUPON', 'CART_PERCENTAGE', 'CART_FLAT')
  AND o.offer_metadata->>'create_path' IN ('boost', 'precision');

-- Precision must stay whole-menu.
UPDATE public.merchant_offers o
SET
  offer_sub_type = 'ALL_ORDERS',
  offer_metadata = jsonb_set(
    COALESCE(o.offer_metadata, '{}'::jsonb),
    '{menu_item_ids}',
    '[]'::jsonb,
    true
  ),
  updated_at = NOW()
WHERE o.offer_type IN ('PERCENTAGE', 'FLAT', 'COUPON')
  AND (
    lower(COALESCE(o.offer_metadata->>'conditions_mode', '')) = 'precision'
    OR o.offer_metadata->>'create_path' = 'precision'
  );

DELETE FROM public.merchant_offer_applicability a
USING public.merchant_offers o
WHERE a.offer_id = o.id
  AND a.menu_item_id IS NOT NULL
  AND o.offer_type IN ('PERCENTAGE', 'FLAT', 'COUPON')
  AND (
    lower(COALESCE(o.offer_metadata->>'conditions_mode', '')) = 'precision'
    OR o.offer_metadata->>'create_path' = 'precision'
  );

-- ----------------------------------------------------------------------------
-- 5) Re-sync applicability from repaired metadata (boost / bogo with items)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT o.id
    FROM public.merchant_offers o
    WHERE COALESCE(o.offer_metadata->>'create_path', '') <> 'precision'
      AND lower(COALESCE(o.offer_metadata->>'conditions_mode', '')) IS DISTINCT FROM 'precision'
      AND jsonb_typeof(COALESCE(o.offer_metadata, '{}'::jsonb)->'menu_item_ids') = 'array'
      AND jsonb_array_length(COALESCE(o.offer_metadata, '{}'::jsonb)->'menu_item_ids') > 0
  LOOP
    BEGIN
      PERFORM public.sync_offer_applicability_from_metadata(r.id);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- function may not exist on older envs
    END;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 6) Bump store offer cache
-- ----------------------------------------------------------------------------
UPDATE public.merchant_stores s
SET offer_pricing_cache_version = COALESCE(s.offer_pricing_cache_version, 1) + 1
WHERE EXISTS (
  SELECT 1
  FROM public.merchant_offers o
  WHERE o.store_id = s.id
);

COMMIT;
