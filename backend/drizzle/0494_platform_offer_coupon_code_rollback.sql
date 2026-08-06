-- Rollback: 0494_platform_offer_coupon_code.sql

DROP INDEX IF EXISTS public.billing_platform_offers_coupon_code_lower_uidx;

ALTER TABLE public.billing_platform_offers
  DROP CONSTRAINT IF EXISTS billing_platform_offers_coupon_code_format_chk;

ALTER TABLE public.billing_platform_offers
  DROP COLUMN IF EXISTS coupon_code;
