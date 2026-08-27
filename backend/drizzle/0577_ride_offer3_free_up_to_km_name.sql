-- Align ride offer #3 name with its real promo (FREE_UP_TO_KM, 5 km, first ride).
-- I/O-safe: single-row UPDATE by primary key. No table rewrite, no geo rebind.

UPDATE public.billing_platform_offers
SET
  name = 'Free ride up to 5 km',
  updated_at = now()
WHERE id = 3
  AND upper(trim(service_type)) = 'RIDE'
  AND COALESCE(promo_config->>'promo_type', '') = 'FREE_UP_TO_KM';
