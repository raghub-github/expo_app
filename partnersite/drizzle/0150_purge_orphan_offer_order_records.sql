-- Mirror of backend/drizzle/0558_purge_orphan_offer_order_records.sql
-- Shared DB: apply the backend file. This copy exists so partnersite drizzle numbering stays sequential.

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
), 0);

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

COMMIT;
