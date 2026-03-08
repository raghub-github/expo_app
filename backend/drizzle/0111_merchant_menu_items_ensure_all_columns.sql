-- =============================================================================
-- Ensure merchant_menu_items has ALL columns required by the merchant-menu API.
-- Use this if your DB was created without 0010 (or with an older schema) so
-- you keep getting "column X does not exist". One migration to fix them all.
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).
-- =============================================================================

-- Enum for approval_status (0103)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_menu_item_approval_status') THEN
    CREATE TYPE merchant_menu_item_approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END
$$;

-- Core columns (0010 / canonical schema)
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES merchant_stores(id) ON DELETE CASCADE;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES merchant_menu_categories(id) ON DELETE SET NULL;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS item_id TEXT;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS item_name TEXT;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS item_description TEXT;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS item_image_url TEXT;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS food_type TEXT;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS spice_level TEXT;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS cuisine_type TEXT;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS base_price NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS selling_price NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS tax_percentage NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT TRUE;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS available_quantity INTEGER;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS has_customizations BOOLEAN DEFAULT FALSE;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS has_addons BOOLEAN DEFAULT FALSE;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT FALSE;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS is_popular BOOLEAN DEFAULT FALSE;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN DEFAULT FALSE;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS preparation_time_minutes INTEGER DEFAULT 15;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS serves INTEGER DEFAULT 1;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS item_metadata JSONB DEFAULT '{}';
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS nutritional_info JSONB DEFAULT '{}';
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS allergens TEXT[];
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 0103 additions
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS packaging_charges NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS tax_group_id TEXT;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS discount_flat NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS dynamic_pricing JSONB DEFAULT '{}';
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS seasonal_flag BOOLEAN DEFAULT FALSE;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS short_name TEXT;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS approval_status merchant_menu_item_approval_status DEFAULT 'PENDING';
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS approved_by TEXT;

-- 0106 additions (Zomato-style details)
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS serves_label TEXT;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS item_size_value NUMERIC(10, 2);
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS item_size_unit TEXT;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS available_for_delivery BOOLEAN DEFAULT TRUE;
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS weight_per_serving NUMERIC(10, 2);
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS weight_per_serving_unit TEXT DEFAULT 'grams';
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS calories_kcal NUMERIC(10, 2);
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS protein NUMERIC(10, 2);
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS protein_unit TEXT DEFAULT 'mg';
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS carbohydrates NUMERIC(10, 2);
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS carbohydrates_unit TEXT DEFAULT 'mg';
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS fat NUMERIC(10, 2);
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS fat_unit TEXT DEFAULT 'mg';
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS fibre NUMERIC(10, 2);
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS fibre_unit TEXT DEFAULT 'mg';
ALTER TABLE merchant_menu_items ADD COLUMN IF NOT EXISTS item_tags TEXT[] DEFAULT '{}';
