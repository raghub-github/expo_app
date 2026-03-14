-- =============================================================================
-- Reusable Addon / Modifier System (Swiggy/Zomato-style)
-- Store-level modifier groups and options; link to items via merchant_item_modifier_groups.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Subscription limits (for validation: max_modifier_groups, max_modifier_options per store)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_modifier_subscription_limits (
  plan_key TEXT PRIMARY KEY,
  max_modifier_groups INTEGER NOT NULL DEFAULT 20,
  max_modifier_options INTEGER NOT NULL DEFAULT 100,
  max_modifier_groups_per_item INTEGER NOT NULL DEFAULT 10,
  max_options_per_group INTEGER NOT NULL DEFAULT 20
);

INSERT INTO merchant_modifier_subscription_limits (plan_key, max_modifier_groups, max_modifier_options, max_modifier_groups_per_item, max_options_per_group)
VALUES
  ('basic', 20, 100, 10, 20),
  ('pro', 100, 1000, 15, 25),
  ('enterprise', 500, 5000, 20, 50)
ON CONFLICT (plan_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Modifier groups (store-level, reusable)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_modifier_groups (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  group_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_required BOOLEAN DEFAULT FALSE,
  min_selection INTEGER DEFAULT 0,
  max_selection INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(store_id, group_code)
);

CREATE INDEX IF NOT EXISTS merchant_modifier_groups_store_id_idx
  ON merchant_modifier_groups(store_id);
CREATE INDEX IF NOT EXISTS merchant_modifier_groups_display_order_idx
  ON merchant_modifier_groups(store_id, display_order);

-- ---------------------------------------------------------------------------
-- Modifier options (under a group)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_modifier_options (
  id BIGSERIAL PRIMARY KEY,
  modifier_group_id BIGINT NOT NULL REFERENCES merchant_modifier_groups(id) ON DELETE CASCADE,
  option_code TEXT NOT NULL,
  name TEXT NOT NULL,
  price_delta NUMERIC(10, 2) DEFAULT 0,
  image_url TEXT,
  in_stock BOOLEAN DEFAULT TRUE,
  default_quantity INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(modifier_group_id, option_code)
);

CREATE INDEX IF NOT EXISTS merchant_modifier_options_group_id_idx
  ON merchant_modifier_options(modifier_group_id);
CREATE INDEX IF NOT EXISTS merchant_modifier_options_display_order_idx
  ON merchant_modifier_options(modifier_group_id, display_order);

-- ---------------------------------------------------------------------------
-- Item ↔ Modifier group link (many-to-many)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_item_modifier_groups (
  id BIGSERIAL PRIMARY KEY,
  menu_item_id BIGINT NOT NULL REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  modifier_group_id BIGINT NOT NULL REFERENCES merchant_modifier_groups(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(menu_item_id, modifier_group_id)
);

CREATE INDEX IF NOT EXISTS merchant_item_modifier_groups_menu_item_id_idx
  ON merchant_item_modifier_groups(menu_item_id);
CREATE INDEX IF NOT EXISTS merchant_item_modifier_groups_modifier_group_id_idx
  ON merchant_item_modifier_groups(modifier_group_id);

-- Safety: non-negative price_delta
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_modifier_options_price_delta_non_negative') THEN
    ALTER TABLE merchant_modifier_options ADD CONSTRAINT chk_modifier_options_price_delta_non_negative
      CHECK (price_delta >= 0);
  END IF;
END $$;
