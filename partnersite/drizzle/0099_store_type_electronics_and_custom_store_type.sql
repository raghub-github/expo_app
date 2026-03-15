-- 0099: Add ELECTRONICS_ECOMMERCE to store_type enum and custom_store_type column for OTHERS sub-type
-- When store_type = 'OTHERS', custom_store_type stores the specific sub-type (e.g. "Clothing Store", "Electronics").

-- 1. Add new value to store_type enum (safe: only if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'store_type' AND e.enumlabel = 'ELECTRONICS_ECOMMERCE'
  ) THEN
    ALTER TYPE public.store_type ADD VALUE 'ELECTRONICS_ECOMMERCE';
  END IF;
END$$;

-- 2. Add custom_store_type column to merchant_stores for OTHERS sub-type (when store_type = 'OTHERS')
ALTER TABLE public.merchant_stores
  ADD COLUMN IF NOT EXISTS custom_store_type TEXT NULL;

COMMENT ON COLUMN public.merchant_stores.custom_store_type IS 'When store_type is OTHERS, this stores the specific sub-type (e.g. Clothing Store, Electronics).';
