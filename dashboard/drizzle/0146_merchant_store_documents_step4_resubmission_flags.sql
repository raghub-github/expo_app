-- Step 4: when a document was rejected and the merchant uploads a new file, we keep
-- the rejection reason visible to admins and set a per-doc flag until they verify or reject again.

DO $$
BEGIN
  IF to_regclass('public.merchant_store_documents') IS NOT NULL THEN
    ALTER TABLE public.merchant_store_documents
      ADD COLUMN IF NOT EXISTS step4_resubmission_flags jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN public.merchant_store_documents.step4_resubmission_flags IS
  'Per-doc keys (pan, gst, …): true after re-upload while rejection_reason still set; cleared on verify/reject.';
