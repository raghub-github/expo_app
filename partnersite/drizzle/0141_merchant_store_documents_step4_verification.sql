-- Same as dashboard/drizzle/0145 — apply once per shared database.
-- Step 4 documents: holder columns + backfill one merchant_store_documents row per store.

DO $$
BEGIN
  IF to_regclass('public.merchant_store_documents') IS NOT NULL THEN
    ALTER TABLE public.merchant_store_documents
      ADD COLUMN IF NOT EXISTS pan_holder_name text NULL,
      ADD COLUMN IF NOT EXISTS aadhaar_holder_name text NULL;
  END IF;
END $$;

INSERT INTO public.merchant_store_documents (store_id)
SELECT ms.id
FROM public.merchant_stores ms
WHERE NOT EXISTS (
  SELECT 1 FROM public.merchant_store_documents d WHERE d.store_id = ms.id
)
ON CONFLICT (store_id) DO NOTHING;
