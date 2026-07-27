-- Rollback 0449_merchant_store_doc_auto_verification (dashboard mirror)

DO $$
BEGIN
  IF to_regclass('public.merchant_store_documents') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.merchant_store_documents
    DROP COLUMN IF EXISTS pan_verification_method,
    DROP COLUMN IF EXISTS gst_verification_method,
    DROP COLUMN IF EXISTS aadhaar_verification_method;
END $$;
