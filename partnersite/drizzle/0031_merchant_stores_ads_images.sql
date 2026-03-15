-- Add ads_images to merchant_stores (max 5 gallery/promotional images per store).
-- banner_url = single store banner; ads_images = up to 5 gallery images.

-- Add column if missing (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_stores' AND column_name = 'ads_images'
  ) THEN
    ALTER TABLE public.merchant_stores
    ADD COLUMN ads_images TEXT[] DEFAULT '{}';
    COMMENT ON COLUMN public.merchant_stores.ads_images IS 'Up to 5 gallery/promotional image URLs';
  END IF;
END $$;

-- Ensure banner_url exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_stores' AND column_name = 'banner_url'
  ) THEN
    ALTER TABLE public.merchant_stores ADD COLUMN banner_url TEXT;
  END IF;
END $$;
