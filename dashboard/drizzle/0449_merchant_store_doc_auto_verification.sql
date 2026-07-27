-- ============================================================================
-- 0449_merchant_store_doc_auto_verification
-- Mirror of backend/drizzle/0449_merchant_store_doc_auto_verification.sql
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.merchant_store_documents') IS NULL THEN
    RAISE NOTICE 'merchant_store_documents missing — skip 0449';
    RETURN;
  END IF;

  ALTER TABLE public.merchant_store_documents
    ADD COLUMN IF NOT EXISTS pan_holder_name text NULL,
    ADD COLUMN IF NOT EXISTS aadhaar_holder_name text NULL;

  ALTER TABLE public.merchant_store_documents
    ADD COLUMN IF NOT EXISTS last_verification_id text NULL,
    ADD COLUMN IF NOT EXISTS last_provider_reference text NULL,
    ADD COLUMN IF NOT EXISTS extracted_data_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS extracted_address jsonb NULL;

  ALTER TABLE public.merchant_store_documents
    ADD COLUMN IF NOT EXISTS pan_verification_method text NULL,
    ADD COLUMN IF NOT EXISTS gst_verification_method text NULL,
    ADD COLUMN IF NOT EXISTS aadhaar_verification_method text NULL;
END $$;

COMMENT ON COLUMN public.merchant_store_documents.pan_verification_method IS
  'How PAN was verified: CASHFREE_AUTO | CASHFREE_ASSISTED | CASHFREE_MANUAL_FALLBACK | MANUAL_UPLOAD | AGENT';
COMMENT ON COLUMN public.merchant_store_documents.gst_verification_method IS
  'How GST was verified: CASHFREE_AUTO | CASHFREE_ASSISTED | CASHFREE_MANUAL_FALLBACK | MANUAL_UPLOAD | AGENT';
COMMENT ON COLUMN public.merchant_store_documents.aadhaar_verification_method IS
  'How Aadhaar was verified: CASHFREE_AUTO | DIGILOCKER | MANUAL_UPLOAD | AGENT';

INSERT INTO public.merchant_store_documents (store_id)
SELECT ms.id
FROM public.merchant_stores ms
WHERE NOT EXISTS (
  SELECT 1 FROM public.merchant_store_documents d WHERE d.store_id = ms.id
)
ON CONFLICT (store_id) DO NOTHING;
