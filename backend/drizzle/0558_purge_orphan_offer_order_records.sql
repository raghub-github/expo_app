-- Purge offer application/usage rows whose orders_core row is gone, keep track
-- counts in sync, and rewrite stale auto-generated "Flat X% Off" titles so they
-- match the live discount_percentage. Also attach a delete trigger so future
-- orders_core removals clean the same tables automatically.

BEGIN;

DELETE FROM public.offer_order_applications oa
WHERE NOT EXISTS (
  SELECT 1 FROM public.orders_core oc
  WHERE oc.id = oa.order_id
     OR oc.order_id = ('GM' || oa.order_id::text)
);

DELETE FROM public.merchant_offer_usages u
WHERE u.order_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.orders_core oc
    WHERE oc.id = u.order_id
       OR oc.order_id = ('GM' || u.order_id::text)
  );

UPDATE public.merchant_offers mo
SET current_uses = COALESCE((
  SELECT COUNT(DISTINCT oa.order_id)::int
  FROM public.offer_order_applications oa
  INNER JOIN public.orders_core oc
    ON oc.id = oa.order_id
    OR oc.order_id = ('GM' || oa.order_id::text)
  WHERE oa.merchant_offer_id = mo.id
    AND oa.offer_source = 'MERCHANT'
), 0)
WHERE COALESCE(mo.current_uses, 0) <> COALESCE((
  SELECT COUNT(DISTINCT oa.order_id)::int
  FROM public.offer_order_applications oa
  INNER JOIN public.orders_core oc
    ON oc.id = oa.order_id
    OR oc.order_id = ('GM' || oa.order_id::text)
  WHERE oa.merchant_offer_id = mo.id
    AND oa.offer_source = 'MERCHANT'
), 0);

-- Generated percentage titles that no longer match the stored discount.
UPDATE public.merchant_offers
SET offer_title = CASE
  WHEN max_discount_amount IS NOT NULL AND max_discount_amount::numeric > 0
    THEN TRIM(to_char(COALESCE(discount_percentage, discount_value), 'FM999990')) || '% Off up to ₹' || TRIM(to_char(max_discount_amount, 'FM9999990'))
  ELSE 'Flat ' || TRIM(to_char(COALESCE(discount_percentage, discount_value), 'FM999990')) || '% Off'
END
WHERE UPPER(COALESCE(offer_type, '')) IN ('PERCENTAGE', 'COUPON', 'CART_PERCENTAGE')
  AND COALESCE(discount_percentage, discount_value) IS NOT NULL
  AND COALESCE(discount_percentage, discount_value)::numeric > 0
  AND offer_title ~* '^(flat[[:space:]]+)?[0-9]+%[[:space:]]+off'
  AND offer_title !~* (
    '^(flat[[:space:]]+)?' ||
    TRIM(to_char(COALESCE(discount_percentage, discount_value), 'FM999990')) ||
    '%[[:space:]]+off'
  );

CREATE OR REPLACE FUNCTION public.purge_offer_records_for_deleted_core_order()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_digits bigint;
  v_offer_ids bigint[];
BEGIN
  v_digits := NULLIF(regexp_replace(COALESCE(OLD.order_id, ''), '\D', '', 'g'), '')::bigint;

  SELECT COALESCE(array_agg(DISTINCT x.offer_id), ARRAY[]::bigint[])
  INTO v_offer_ids
  FROM (
    SELECT oa.merchant_offer_id AS offer_id
    FROM public.offer_order_applications oa
    WHERE oa.merchant_offer_id IS NOT NULL
      AND (oa.order_id = OLD.id OR (v_digits IS NOT NULL AND oa.order_id = v_digits))
    UNION
    SELECT u.offer_id
    FROM public.merchant_offer_usages u
    WHERE u.offer_id IS NOT NULL
      AND (u.order_id = OLD.id OR (v_digits IS NOT NULL AND u.order_id = v_digits))
  ) x;

  DELETE FROM public.offer_order_applications oa
  WHERE oa.order_id = OLD.id
     OR (v_digits IS NOT NULL AND oa.order_id = v_digits);

  DELETE FROM public.merchant_offer_usages u
  WHERE u.order_id = OLD.id
     OR (v_digits IS NOT NULL AND u.order_id = v_digits);

  IF to_regclass('public.platform_offer_usages') IS NOT NULL THEN
    EXECUTE $q$
      DELETE FROM public.platform_offer_usages pou
      WHERE pou.order_id = $1
         OR pou.order_id_text = $2
         OR ($3::bigint IS NOT NULL AND pou.order_id = $3)
    $q$ USING OLD.id, OLD.order_id, v_digits;
  END IF;

  IF cardinality(v_offer_ids) > 0 THEN
    UPDATE public.merchant_offers mo
    SET current_uses = COALESCE((
      SELECT COUNT(DISTINCT oa.order_id)::int
      FROM public.offer_order_applications oa
      WHERE oa.merchant_offer_id = mo.id
        AND oa.offer_source = 'MERCHANT'
    ), 0)
    WHERE mo.id = ANY(v_offer_ids);
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_core_purge_offer_records ON public.orders_core;
CREATE TRIGGER trg_orders_core_purge_offer_records
BEFORE DELETE ON public.orders_core
FOR EACH ROW
EXECUTE FUNCTION public.purge_offer_records_for_deleted_core_order();

COMMIT;
