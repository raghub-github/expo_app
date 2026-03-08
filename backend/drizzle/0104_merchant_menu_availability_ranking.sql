-- Item-level availability and ranking. Idempotent.

-- Item availability (day/time windows per item)
CREATE TABLE IF NOT EXISTS merchant_menu_item_availability (
  id BIGSERIAL PRIMARY KEY,
  menu_item_id BIGINT NOT NULL REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE merchant_menu_item_availability ADD COLUMN IF NOT EXISTS menu_item_id BIGINT REFERENCES merchant_menu_items(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS merchant_menu_item_availability_menu_item_id_idx ON merchant_menu_item_availability(menu_item_id);

-- Ranking: order_count, click_count for popularity / is_popular, is_recommended
CREATE TABLE IF NOT EXISTS merchant_menu_item_ranking (
  id BIGSERIAL PRIMARY KEY,
  menu_item_id BIGINT NOT NULL REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  order_count INTEGER NOT NULL DEFAULT 0,
  click_count INTEGER NOT NULL DEFAULT 0,
  last_ordered_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(menu_item_id)
);

ALTER TABLE merchant_menu_item_ranking ADD COLUMN IF NOT EXISTS menu_item_id BIGINT REFERENCES merchant_menu_items(id) ON DELETE CASCADE;
ALTER TABLE merchant_menu_item_ranking ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES merchant_stores(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS merchant_menu_item_ranking_store_id_idx ON merchant_menu_item_ranking(store_id);
CREATE INDEX IF NOT EXISTS merchant_menu_item_ranking_order_count_idx ON merchant_menu_item_ranking(store_id, order_count DESC);
