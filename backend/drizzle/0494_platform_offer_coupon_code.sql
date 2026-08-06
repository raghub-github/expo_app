-- Platform offers: dedicated coupon_code (unique, case-insensitive).
-- Mirror: dashboard/drizzle/0484_platform_offer_coupon_code.sql

ALTER TABLE public.billing_platform_offers
  ADD COLUMN IF NOT EXISTS coupon_code text;

COMMENT ON COLUMN public.billing_platform_offers.coupon_code IS
  'Customer-facing promo code for this platform offer. Unique case-insensitively; A-Z 0-9 _ -.';

UPDATE public.billing_platform_offers
SET coupon_code = CASE
  WHEN length(regexp_replace(upper(coalesce(name, '')), '[^A-Z0-9]', '', 'g')) >= 4
    THEN left(regexp_replace(upper(coalesce(name, '')), '[^A-Z0-9]', '', 'g'), 24)
  ELSE 'GM' || lpad(id::text, 6, '0')
END
WHERE coupon_code IS NULL OR btrim(coupon_code) = '';

UPDATE public.billing_platform_offers
SET coupon_code = regexp_replace(upper(btrim(coupon_code)), '[^A-Z0-9_-]', '', 'g')
WHERE coupon_code IS NOT NULL;

UPDATE public.billing_platform_offers
SET coupon_code = 'GM' || lpad(id::text, 6, '0')
WHERE coupon_code IS NULL OR btrim(coupon_code) = '';

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY lower(coupon_code) ORDER BY id ASC) AS rn
  FROM public.billing_platform_offers
  WHERE coupon_code IS NOT NULL
)
UPDATE public.billing_platform_offers o
SET coupon_code = left(o.coupon_code, 20) || '-' || o.id::text
FROM ranked r
WHERE o.id = r.id
  AND r.rn > 1;

ALTER TABLE public.billing_platform_offers
  ALTER COLUMN coupon_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_platform_offers_coupon_code_format_chk'
  ) THEN
    ALTER TABLE public.billing_platform_offers
      ADD CONSTRAINT billing_platform_offers_coupon_code_format_chk
      CHECK (coupon_code ~ '^[A-Z0-9_-]+$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS billing_platform_offers_coupon_code_lower_uidx
  ON public.billing_platform_offers (lower(coupon_code));
