-- 0097: Remove category image/description from merchant_menu_categories; remove ads_images from merchant_stores.
-- Banner/gallery: use banner_url and gallery_images only. Gallery displays from gallery_images column.

-- 1. Drop category_description and category_image_url from merchant_menu_categories
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_menu_categories' AND column_name = 'category_description'
  ) THEN
    ALTER TABLE public.merchant_menu_categories DROP COLUMN category_description;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_menu_categories' AND column_name = 'category_image_url'
  ) THEN
    ALTER TABLE public.merchant_menu_categories DROP COLUMN category_image_url;
  END IF;
END $$;

-- 2. Drop ads_images from merchant_stores (gallery uses gallery_images only)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_stores' AND column_name = 'ads_images'
  ) THEN
    ALTER TABLE public.merchant_stores DROP COLUMN ads_images;
  END IF;
END $$;

COMMENT ON TABLE public.merchant_menu_categories IS 'Menu categories per store. Columns: id, store_id, category_name, is_active, created_at, updated_at.';
