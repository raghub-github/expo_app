-- Ensure merchant_menu_categories has all columns required by merchant-menu service.
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).
-- Fixes: column "category_description" of relation "merchant_menu_categories" does not exist

ALTER TABLE merchant_menu_categories ADD COLUMN IF NOT EXISTS category_description TEXT;
ALTER TABLE merchant_menu_categories ADD COLUMN IF NOT EXISTS category_image_url TEXT;
ALTER TABLE merchant_menu_categories ADD COLUMN IF NOT EXISTS parent_category_id BIGINT REFERENCES merchant_menu_categories(id) ON DELETE SET NULL;
ALTER TABLE merchant_menu_categories ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
ALTER TABLE merchant_menu_categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE merchant_menu_categories ADD COLUMN IF NOT EXISTS category_metadata JSONB DEFAULT '{}';
ALTER TABLE merchant_menu_categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
ALTER TABLE merchant_menu_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS merchant_menu_categories_parent_category_id_idx
  ON merchant_menu_categories(parent_category_id) WHERE parent_category_id IS NOT NULL;
