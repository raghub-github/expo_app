-- Structured per-doc-type rejection (issues + note) for step 4 field-level vs image-level handling.

DO $$
BEGIN
  IF to_regclass('public.merchant_store_documents') IS NOT NULL THEN
    ALTER TABLE public.merchant_store_documents
      ADD COLUMN IF NOT EXISTS step4_rejection_details jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN public.merchant_store_documents.step4_rejection_details IS
  'JSON object keyed by doc type (pan, gst, …): { issues: string[], note?: string } for reviewer rejection breakdown.';
