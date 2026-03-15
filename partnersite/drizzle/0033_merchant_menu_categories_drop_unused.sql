-- Drop unused columns from merchant_menu_categories (display_order, category_metadata)
-- Run after 0032 if you need category_image_url; this only drops display_order and category_metadata.

DROP INDEX IF EXISTS public.merchant_menu_categories_display_order_idx;

ALTER TABLE public.merchant_menu_categories
  DROP COLUMN IF EXISTS display_order,
  DROP COLUMN IF EXISTS category_metadata;

COMMENT ON TABLE public.merchant_menu_categories IS 'Menu categories per store. Columns: id, store_id, category_name, category_description, category_image_url, is_active, created_at, updated_at.';
