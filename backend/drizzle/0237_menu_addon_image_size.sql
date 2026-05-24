-- Addon option image (proxy URL) + serving size for merchant menu customization options.

ALTER TABLE merchant_menu_item_addons
  ADD COLUMN IF NOT EXISTS addon_size_value NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS addon_size_unit TEXT;

COMMENT ON COLUMN merchant_menu_item_addons.addon_image_url IS
  'Proxy signed URL (/api/attachments/proxy?key=...) after R2 upload; same pattern as menu item images.';

COMMENT ON COLUMN merchant_menu_item_addons.addon_size_value IS
  'Optional portion size amount (e.g. 250 for 250 ml Coke).';

COMMENT ON COLUMN merchant_menu_item_addons.addon_size_unit IS
  'Unit for addon_size_value: ml, litre, grams, piece, serves, etc.';

-- Optional size label for variants (Half / Full / Family pack portion — not required).
ALTER TABLE merchant_menu_item_variants
  ADD COLUMN IF NOT EXISTS variant_size_value NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS variant_size_unit TEXT;

COMMENT ON COLUMN merchant_menu_item_variants.variant_size_value IS
  'Optional portion amount for this variant (e.g. 500 for 500 g).';

COMMENT ON COLUMN merchant_menu_item_variants.variant_size_unit IS
  'Unit for variant_size_value: grams, ml, serves, piece, etc.';
