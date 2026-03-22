-- Menu reference files: single display URL column; R2 key optional (derived from proxy for deletes).
-- Run on Supabase before deploying code that inserts menu_url-only rows.

ALTER TABLE public.merchant_store_media_files
  ADD COLUMN IF NOT EXISTS menu_url text;

COMMENT ON COLUMN public.merchant_store_media_files.menu_url IS
  'Proxy or public URL for MENU_REFERENCE files (canonical for display). Prefer /api/attachments/proxy?key=...';

UPDATE public.merchant_store_media_files
SET menu_url = NULLIF(trim(public_url), '')
WHERE media_scope = 'MENU_REFERENCE'
  AND menu_url IS NULL
  AND public_url IS NOT NULL
  AND trim(public_url) <> '';

ALTER TABLE public.merchant_store_media_files
  ALTER COLUMN r2_key DROP NOT NULL;
