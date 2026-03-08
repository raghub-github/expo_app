-- Merchant Menu Engine: missing columns, new tables, indexes.
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.

-- =============================================================================
-- ALTER existing tables (add missing columns)
-- =============================================================================

-- Categories: hierarchy, display_order, is_active, store_id (for indexes below)
ALTER TABLE merchant_menu_categories
  ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES merchant_stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS parent_category_id BIGINT REFERENCES merchant_menu_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS merchant_menu_categories_parent_category_id_idx ON merchant_menu_categories(parent_category_id) WHERE parent_category_id IS NOT NULL;

-- Items: pricing, soft delete, display (ensure store_id, in_stock, display_order, is_active exist for indexes)
ALTER TABLE merchant_menu_items
  ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES merchant_stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS packaging_charges NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_group_id TEXT,
  ADD COLUMN IF NOT EXISTS discount_flat NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dynamic_pricing JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS seasonal_flag BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS short_name TEXT,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS merchant_menu_items_is_deleted_idx ON merchant_menu_items(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS merchant_menu_items_store_active_stock_idx ON merchant_menu_items(store_id, is_active, in_stock);
CREATE INDEX IF NOT EXISTS merchant_menu_items_category_display_order_idx ON merchant_menu_items(category_id, display_order) WHERE category_id IS NOT NULL;

-- Variants: price mode, image override
ALTER TABLE merchant_menu_item_variants
  ADD COLUMN IF NOT EXISTS price_mode TEXT DEFAULT 'absolute',
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- =============================================================================
-- New table: multi-image per item
-- =============================================================================
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

ALTER TABLE merchant_menu_item_images ADD COLUMN IF NOT EXISTS menu_item_id BIGINT REFERENCES merchant_menu_items(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS merchant_menu_item_images_menu_item_id_idx ON merchant_menu_item_images(menu_item_id);
CREATE INDEX IF NOT EXISTS merchant_menu_item_images_is_primary_idx ON merchant_menu_item_images(menu_item_id, is_primary) WHERE is_primary = TRUE;

-- =============================================================================
-- New table: inventory (item or variant stock)
-- =============================================================================
CREATE TABLE IF NOT EXISTS merchant_menu_inventory (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  menu_item_id BIGINT NOT NULL REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  variant_id BIGINT REFERENCES merchant_menu_item_variants(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(menu_item_id, variant_id)
);

ALTER TABLE merchant_menu_inventory ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES merchant_stores(id) ON DELETE CASCADE;
ALTER TABLE merchant_menu_inventory ADD COLUMN IF NOT EXISTS menu_item_id BIGINT REFERENCES merchant_menu_items(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS merchant_menu_inventory_store_id_idx ON merchant_menu_inventory(store_id);
CREATE INDEX IF NOT EXISTS merchant_menu_inventory_menu_item_id_idx ON merchant_menu_inventory(menu_item_id);

-- =============================================================================
-- New tables: addon groups & addons (per-item, distinct from customization addons)
-- =============================================================================
CREATE TABLE IF NOT EXISTS merchant_menu_addon_groups (
  id BIGSERIAL PRIMARY KEY,
  menu_item_id BIGINT NOT NULL REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  group_name TEXT NOT NULL,
  min_selection INTEGER DEFAULT 0,
  max_selection INTEGER DEFAULT 1,
  is_required BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE merchant_menu_addon_groups ADD COLUMN IF NOT EXISTS menu_item_id BIGINT REFERENCES merchant_menu_items(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS merchant_menu_addon_groups_menu_item_id_idx ON merchant_menu_addon_groups(menu_item_id);

CREATE TABLE IF NOT EXISTS merchant_menu_addons (
  id BIGSERIAL PRIMARY KEY,
  addon_group_id BIGINT NOT NULL REFERENCES merchant_menu_addon_groups(id) ON DELETE CASCADE,
  addon_name TEXT NOT NULL,
  addon_price NUMERIC(10, 2) DEFAULT 0,
  image_url TEXT,
  in_stock BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_menu_addons_addon_group_id_idx ON merchant_menu_addons(addon_group_id);

-- =============================================================================
-- New tables: combos
-- =============================================================================
CREATE TABLE IF NOT EXISTS merchant_menu_combos (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  combo_name TEXT NOT NULL,
  description TEXT,
  combo_price NUMERIC(10, 2) NOT NULL,
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_deleted BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE merchant_menu_combos ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES merchant_stores(id) ON DELETE CASCADE;
ALTER TABLE merchant_menu_combos ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE merchant_menu_combos ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS merchant_menu_combos_store_id_idx ON merchant_menu_combos(store_id);
CREATE INDEX IF NOT EXISTS merchant_menu_combos_is_active_idx ON merchant_menu_combos(store_id, is_active, is_deleted);

CREATE TABLE IF NOT EXISTS merchant_menu_combo_components (
  id BIGSERIAL PRIMARY KEY,
  combo_id BIGINT NOT NULL REFERENCES merchant_menu_combos(id) ON DELETE CASCADE,
  menu_item_id BIGINT NOT NULL REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  variant_id BIGINT REFERENCES merchant_menu_item_variants(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE merchant_menu_combo_components ADD COLUMN IF NOT EXISTS menu_item_id BIGINT REFERENCES merchant_menu_items(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS merchant_menu_combo_components_combo_id_idx ON merchant_menu_combo_components(combo_id);

-- =============================================================================
-- New tables: dietary tags & item-tag mapping
-- =============================================================================
CREATE TABLE IF NOT EXISTS merchant_menu_dietary_tags (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE merchant_menu_dietary_tags ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES merchant_stores(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS merchant_menu_dietary_tags_store_id_idx ON merchant_menu_dietary_tags(store_id);

CREATE TABLE IF NOT EXISTS merchant_menu_item_tags (
  id BIGSERIAL PRIMARY KEY,
  menu_item_id BIGINT NOT NULL REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  dietary_tag_id BIGINT NOT NULL REFERENCES merchant_menu_dietary_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(menu_item_id, dietary_tag_id)
);

ALTER TABLE merchant_menu_item_tags ADD COLUMN IF NOT EXISTS menu_item_id BIGINT REFERENCES merchant_menu_items(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS merchant_menu_item_tags_menu_item_id_idx ON merchant_menu_item_tags(menu_item_id);
CREATE INDEX IF NOT EXISTS merchant_menu_item_tags_dietary_tag_id_idx ON merchant_menu_item_tags(dietary_tag_id);

-- =============================================================================
-- New table: category availability (time windows per category)
-- =============================================================================
CREATE TABLE IF NOT EXISTS merchant_menu_category_availability (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES merchant_menu_categories(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_menu_category_availability_category_id_idx ON merchant_menu_category_availability(category_id);

-- =============================================================================
-- Composite indexes for fast menu loading (per plan)
-- =============================================================================
CREATE INDEX IF NOT EXISTS merchant_menu_categories_store_display_idx ON merchant_menu_categories(store_id, display_order) WHERE is_active = TRUE;

-- =============================================================================
-- Menu item approval workflow (merchant = PENDING, agent = APPROVED)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_menu_item_approval_status') THEN
    CREATE TYPE merchant_menu_item_approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END
$$;

ALTER TABLE merchant_menu_items
  ADD COLUMN IF NOT EXISTS approval_status merchant_menu_item_approval_status DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS approved_by TEXT;

CREATE INDEX IF NOT EXISTS merchant_menu_items_approval_status_idx ON merchant_menu_items(store_id, approval_status) WHERE approval_status = 'APPROVED';
COMMENT ON COLUMN merchant_menu_items.approval_status IS 'PENDING when merchant adds; APPROVED when agent adds or after agent verification.';
