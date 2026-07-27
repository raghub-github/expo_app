-- Rollback 0451_gst_fetched_business_info

DO $$
BEGIN
  IF to_regclass('public.merchant_store_documents') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.merchant_store_documents
    DROP COLUMN IF EXISTS gst_legal_business_name,
    DROP COLUMN IF EXISTS gst_principal_place_of_business,
    DROP COLUMN IF EXISTS gst_effective_registration_date;
END $$;
