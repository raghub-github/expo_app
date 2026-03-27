-- Step 4 (restaurant documents): ensure schema + one row per store so per-doc verify/reject UPDATEs always apply.
-- Aligns with dashboard POST /api/merchant/stores/[id]/documents/verify.

-- Holder names (onboarding / agent edits) — safe if already present from a manual DDL
DO $$
BEGIN
  IF to_regclass('public.merchant_store_documents') IS NOT NULL THEN
    ALTER TABLE public.merchant_store_documents
      ADD COLUMN IF NOT EXISTS pan_holder_name text NULL,
      ADD COLUMN IF NOT EXISTS aadhaar_holder_name text NULL;
  END IF;
END $$;

-- Backfill: stores without a documents row get an empty shell row (verify/reject need a target row;
-- requires UNIQUE(store_id) on merchant_store_documents, e.g. merchant_store_documents_new_store_id_key)
INSERT INTO public.merchant_store_documents (store_id)
SELECT ms.id
FROM public.merchant_stores ms
WHERE NOT EXISTS (
  SELECT 1 FROM public.merchant_store_documents d WHERE d.store_id = ms.id
)
ON CONFLICT (store_id) DO NOTHING;

COMMENT ON TABLE public.merchant_store_documents IS
  'One row per store; columns pan_*, gst_*, etc. support independent verify/reject per document type (step 4).';
