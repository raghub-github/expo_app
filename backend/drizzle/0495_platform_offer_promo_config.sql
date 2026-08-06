-- Ride/Parcel platform offer promo_config (jsonb).
-- Food offers leave as {}. Mirror: dashboard/drizzle/0485_platform_offer_promo_config.sql
-- Idempotent / backward compatible / no data loss.

ALTER TABLE public.billing_platform_offers
  ADD COLUMN IF NOT EXISTS promo_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.billing_platform_offers.promo_config IS
  'Ride/Parcel promo configuration (promo_type, first_n, vehicle, payment, peak, distance, parcel rules). Food offers use {}.';

UPDATE public.billing_platform_offers
SET promo_config = '{}'::jsonb
WHERE promo_config IS NULL;
