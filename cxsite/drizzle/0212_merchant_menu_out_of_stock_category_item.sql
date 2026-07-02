-- Sync with backend/drizzle/0212_merchant_menu_out_of_stock_category_item.sql
-- Category/item out-of-stock scheduling for merchant menu + customer visibility.

ALTER TABLE merchant_menu_categories
  ADD COLUMN IF NOT EXISTS out_of_stock_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS out_of_stock_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS out_of_stock_updated_at timestamptz NULL;

ALTER TABLE merchant_menu_items
  ADD COLUMN IF NOT EXISTS out_of_stock_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS out_of_stock_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS out_of_stock_updated_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS merchant_menu_categories_oos_manual_idx
  ON merchant_menu_categories (store_id, id)
  WHERE out_of_stock_manual = true;

CREATE INDEX IF NOT EXISTS merchant_menu_categories_oos_until_idx
  ON merchant_menu_categories (store_id, out_of_stock_until)
  WHERE out_of_stock_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS merchant_menu_items_oos_manual_idx
  ON merchant_menu_items (store_id, id)
  WHERE out_of_stock_manual = true;

CREATE INDEX IF NOT EXISTS merchant_menu_items_oos_until_idx
  ON merchant_menu_items (store_id, out_of_stock_until)
  WHERE out_of_stock_until IS NOT NULL;
