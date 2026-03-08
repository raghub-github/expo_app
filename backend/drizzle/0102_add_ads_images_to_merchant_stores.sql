-- Add ads_images column to merchant_stores if it does not exist.
-- This fixes \"column ms.ads_images does not exist\" errors in get_nearby_merchant_stores
-- and keep schema aligned with backend merchant module expectations.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchant_stores'
      AND column_name = 'ads_images'
  ) THEN
    ALTER TABLE public.merchant_stores
      ADD COLUMN ads_images text[] NULL;
  END IF;
END $$;

