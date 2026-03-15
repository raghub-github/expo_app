-- Ensure merchant_menu_categories has category_image_url (optional; may already exist from 0010)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchant_menu_categories'
      AND column_name = 'category_image_url'
  ) THEN
    ALTER TABLE public.merchant_menu_categories
      ADD COLUMN category_image_url TEXT;
    COMMENT ON COLUMN public.merchant_menu_categories.category_image_url IS 'Optional image URL for the category';
  END IF;
END $$;
