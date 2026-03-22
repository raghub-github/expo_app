-- Same as dashboard 0146: partner + dashboard share DB schema for merchant_store_documents.

DO $$
BEGIN
  IF to_regclass('public.merchant_store_documents') IS NOT NULL THEN
    ALTER TABLE public.merchant_store_documents
      ADD COLUMN IF NOT EXISTS step4_resubmission_flags jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN public.merchant_store_documents.step4_resubmission_flags IS
  'Per-doc keys (pan, gst, …): true after re-upload while rejection_reason still set; cleared on verify/reject.';
