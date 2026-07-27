-- ============================================================================
-- 0451_gst_fetched_business_info
-- Persist Cashfree GSTIN business details as first-class columns so auto-verify
-- and manual onboarding can save / reload them consistently.
-- Mirror of dashboard/drizzle/0451_gst_fetched_business_info.sql
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.merchant_store_documents') IS NULL THEN
    RAISE NOTICE 'merchant_store_documents missing — skip 0451';
    RETURN;
  END IF;

  ALTER TABLE public.merchant_store_documents
    ADD COLUMN IF NOT EXISTS gst_legal_business_name text NULL,
    ADD COLUMN IF NOT EXISTS gst_principal_place_of_business text NULL,
    ADD COLUMN IF NOT EXISTS gst_effective_registration_date text NULL;
END $$;

COMMENT ON COLUMN public.merchant_store_documents.gst_legal_business_name IS
  'Legal Name of Business from GSTIN verify (Cashfree) or manual entry';
COMMENT ON COLUMN public.merchant_store_documents.gst_principal_place_of_business IS
  'Principal Place of Business from GSTIN verify (Cashfree) or manual entry';
COMMENT ON COLUMN public.merchant_store_documents.gst_effective_registration_date IS
  'Effective Date of Registration from GSTIN verify (Cashfree) or manual entry (prefer YYYY-MM-DD)';

-- Backfill from existing auto-verification metadata when columns are empty.
UPDATE public.merchant_store_documents d
SET
  gst_legal_business_name = COALESCE(
    NULLIF(BTRIM(d.gst_legal_business_name), ''),
    NULLIF(BTRIM(d.gst_document_metadata #>> '{auto_verification,verified_data,legal_name_of_business}'), ''),
    NULLIF(BTRIM(d.extracted_data_summary #>> '{gstin,verifiedData,legal_name_of_business}'), ''),
    NULLIF(BTRIM(d.extracted_data_summary #>> '{gstin,verified_data,legal_name_of_business}'), '')
  ),
  gst_principal_place_of_business = COALESCE(
    NULLIF(BTRIM(d.gst_principal_place_of_business), ''),
    NULLIF(BTRIM(d.gst_document_metadata #>> '{auto_verification,verified_data,principal_place_address}'), ''),
    NULLIF(BTRIM(d.extracted_data_summary #>> '{gstin,verifiedData,principal_place_address}'), ''),
    NULLIF(BTRIM(d.extracted_data_summary #>> '{gstin,verified_data,principal_place_address}'), '')
  ),
  gst_effective_registration_date = COALESCE(
    NULLIF(BTRIM(d.gst_effective_registration_date), ''),
    NULLIF(BTRIM(d.gst_document_metadata #>> '{auto_verification,verified_data,date_of_registration}'), ''),
    NULLIF(BTRIM(d.extracted_data_summary #>> '{gstin,verifiedData,date_of_registration}'), ''),
    NULLIF(BTRIM(d.extracted_data_summary #>> '{gstin,verified_data,date_of_registration}'), '')
  )
WHERE
  d.gst_document_number IS NOT NULL
  AND (
    d.gst_legal_business_name IS NULL
    OR BTRIM(d.gst_legal_business_name) = ''
    OR d.gst_principal_place_of_business IS NULL
    OR BTRIM(d.gst_principal_place_of_business) = ''
    OR d.gst_effective_registration_date IS NULL
    OR BTRIM(d.gst_effective_registration_date) = ''
  );
