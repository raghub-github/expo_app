-- Drop unused columns from merchant_menu_items (display_order, item_metadata, nutritional_info)
-- Align with simplified menu item form and table schema.

ALTER TABLE public.merchant_menu_items
  DROP COLUMN IF EXISTS display_order,
  DROP COLUMN IF EXISTS item_metadata,
  DROP COLUMN IF EXISTS nutritional_info;

COMMENT ON TABLE public.merchant_menu_items IS 'Menu items per store. Core fields only; display_order, item_metadata, nutritional_info removed.';
