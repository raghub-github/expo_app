-- Add PAN and Aadhaar holder name columns to merchant_store_documents for onboarding.
-- Safe to run: adds columns only if they do not exist.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_store_documents' AND column_name = 'pan_holder_name'
  ) THEN
    ALTER TABLE public.merchant_store_documents ADD COLUMN pan_holder_name TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_store_documents' AND column_name = 'aadhaar_holder_name'
  ) THEN
    ALTER TABLE public.merchant_store_documents ADD COLUMN aadhaar_holder_name TEXT;
  END IF;
END $$;
