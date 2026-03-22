-- One active MENU_REFERENCE sheet/PDF per store; optional jsonb array for menu reference images.

ALTER TABLE public.merchant_store_media_files
  ADD COLUMN IF NOT EXISTS menu_reference_image_urls jsonb NULL;

COMMENT ON COLUMN public.merchant_store_media_files.menu_reference_image_urls IS
  'When source_entity = ONBOARDING_MENU_IMAGE: JSON array of {id, url, file_name?} proxy URLs; single row per store.';

-- Remove duplicate sheet rows (keep newest id per store).
DELETE FROM public.merchant_store_media_files a
  USING public.merchant_store_media_files b
  WHERE a.media_scope = 'MENU_REFERENCE'
    AND b.media_scope = 'MENU_REFERENCE'
    AND a.source_entity = 'ONBOARDING_MENU_SHEET'
    AND b.source_entity = 'ONBOARDING_MENU_SHEET'
    AND a.store_id = b.store_id
    AND a.id < b.id;

-- Remove duplicate PDF rows (keep newest id per store).
DELETE FROM public.merchant_store_media_files a
  USING public.merchant_store_media_files b
  WHERE a.media_scope = 'MENU_REFERENCE'
    AND b.media_scope = 'MENU_REFERENCE'
    AND a.source_entity = 'ONBOARDING_MENU_PDF'
    AND b.source_entity = 'ONBOARDING_MENU_PDF'
    AND a.store_id = b.store_id
    AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS merchant_store_media_files_menu_sheet_one_per_store
  ON public.merchant_store_media_files (store_id)
  WHERE media_scope = 'MENU_REFERENCE' AND source_entity = 'ONBOARDING_MENU_SHEET';

CREATE UNIQUE INDEX IF NOT EXISTS merchant_store_media_files_menu_pdf_one_per_store
  ON public.merchant_store_media_files (store_id)
  WHERE media_scope = 'MENU_REFERENCE' AND source_entity = 'ONBOARDING_MENU_PDF';
