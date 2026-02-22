-- Ensure merchant_menu_items has customization flags for dynamic item sheet (optional if already present).
ALTER TABLE public.merchant_menu_items
  ADD COLUMN IF NOT EXISTS has_customizations boolean NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_addons boolean NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_variants boolean NULL DEFAULT false;

COMMENT ON COLUMN public.merchant_menu_items.has_customizations IS 'When true, open customization sheet; options from merchant_menu_item_customizations.';
COMMENT ON COLUMN public.merchant_menu_items.has_addons IS 'When true, item has addons (under customizations).';
COMMENT ON COLUMN public.merchant_menu_items.has_variants IS 'When true, item has variants from merchant_menu_item_variants.';
