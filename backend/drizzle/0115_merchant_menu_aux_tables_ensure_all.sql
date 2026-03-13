-- =============================================================================
-- Ensure merchant-menu auxiliary tables (variants, customizations, images, addons)
-- have all columns expected by the merchant-menu API.
-- Fixes errors like:
--   - relation "merchant_menu_item_customizations" does not exist
--   - column "variant_id" does not exist
--   - column "display_order" does not exist
--   - column "r2_key" of relation "merchant_menu_item_images" does not exist
--
-- Safe to run multiple times (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Customizations table (per-item groups like "Choose your rice")
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS merchant_menu_item_customizations (
  id BIGSERIAL PRIMARY KEY,
  customization_id TEXT NOT NULL UNIQUE,
  menu_item_id BIGINT NOT NULL REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  customization_title TEXT NOT NULL,
  customization_type TEXT,
  is_required BOOLEAN DEFAULT FALSE,
  min_selection INTEGER DEFAULT 0,
  max_selection INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE merchant_menu_item_customizations
  ADD COLUMN IF NOT EXISTS customization_id TEXT,
  ADD COLUMN IF NOT EXISTS menu_item_id BIGINT REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS customization_title TEXT,
  ADD COLUMN IF NOT EXISTS customization_type TEXT,
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS min_selection INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_selection INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS merchant_menu_item_customizations_menu_item_id_idx
  ON merchant_menu_item_customizations(menu_item_id);

CREATE INDEX IF NOT EXISTS merchant_menu_item_customizations_customization_id_idx
  ON merchant_menu_item_customizations(customization_id);

-- ---------------------------------------------------------------------------
-- Customization options / addons under a customization group
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS merchant_menu_item_addons (
  id BIGSERIAL PRIMARY KEY,
  addon_id TEXT NOT NULL UNIQUE,
  customization_id BIGINT NOT NULL REFERENCES merchant_menu_item_customizations(id) ON DELETE CASCADE,
  addon_name TEXT NOT NULL,
  addon_price NUMERIC(10, 2) DEFAULT 0,
  addon_image_url TEXT,
  in_stock BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE merchant_menu_item_addons
  ADD COLUMN IF NOT EXISTS addon_id TEXT,
  ADD COLUMN IF NOT EXISTS customization_id BIGINT REFERENCES merchant_menu_item_customizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS addon_name TEXT,
  ADD COLUMN IF NOT EXISTS addon_price NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS addon_image_url TEXT,
  ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS merchant_menu_item_addons_customization_id_idx
  ON merchant_menu_item_addons(customization_id);

CREATE INDEX IF NOT EXISTS merchant_menu_item_addons_addon_id_idx
  ON merchant_menu_item_addons(addon_id);

-- ---------------------------------------------------------------------------
-- Variants table (size/weight variants per item)
-- ---------------------------------------------------------------------------

ALTER TABLE merchant_menu_item_variants
  ADD COLUMN IF NOT EXISTS variant_id TEXT,
  ADD COLUMN IF NOT EXISTS menu_item_id BIGINT REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS variant_name TEXT,
  ADD COLUMN IF NOT EXISTS variant_type TEXT,
  ADD COLUMN IF NOT EXISTS variant_price NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS price_difference NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS available_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS merchant_menu_item_variants_menu_item_id_idx
  ON merchant_menu_item_variants(menu_item_id);

CREATE INDEX IF NOT EXISTS merchant_menu_item_variants_variant_id_idx
  ON merchant_menu_item_variants(variant_id);

-- ---------------------------------------------------------------------------
-- Item images table (multi-image support with R2 key)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS merchant_menu_item_images (
  id BIGSERIAL PRIMARY KEY,
  menu_item_id BIGINT NOT NULL REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  r2_key TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  format TEXT,
  moderation_status TEXT DEFAULT 'pending',
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE merchant_menu_item_images
  ADD COLUMN IF NOT EXISTS menu_item_id BIGINT REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS r2_key TEXT,
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS format TEXT,
  ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS merchant_menu_item_images_menu_item_id_idx
  ON merchant_menu_item_images(menu_item_id);

CREATE INDEX IF NOT EXISTS merchant_menu_item_images_is_primary_idx
  ON merchant_menu_item_images(menu_item_id, is_primary)
  WHERE is_primary = TRUE;

