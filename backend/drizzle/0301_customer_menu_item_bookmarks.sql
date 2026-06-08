-- Saved menu items (dishes) per customer — mirrors customer_store_bookmarks pattern.
CREATE TABLE IF NOT EXISTS customer_menu_item_bookmarks (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  menu_item_id BIGINT NOT NULL,
  store_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS customer_menu_item_bookmarks_customer_idx
  ON customer_menu_item_bookmarks (customer_id);

CREATE INDEX IF NOT EXISTS customer_menu_item_bookmarks_store_idx
  ON customer_menu_item_bookmarks (store_id);
