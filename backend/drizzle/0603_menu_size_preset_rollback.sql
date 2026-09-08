-- Rollback 0603 menu size_preset. Drops additive column only; does not touch size/unit data.

ALTER TABLE public.merchant_menu_items
  DROP CONSTRAINT IF EXISTS merchant_menu_items_size_preset_chk;
ALTER TABLE public.merchant_menu_item_variants
  DROP CONSTRAINT IF EXISTS merchant_menu_item_variants_size_preset_chk;
ALTER TABLE public.merchant_menu_item_addons
  DROP CONSTRAINT IF EXISTS merchant_menu_item_addons_size_preset_chk;

ALTER TABLE public.merchant_menu_items DROP COLUMN IF EXISTS size_preset;
ALTER TABLE public.merchant_menu_item_variants DROP COLUMN IF EXISTS size_preset;
ALTER TABLE public.merchant_menu_item_addons DROP COLUMN IF EXISTS size_preset;
