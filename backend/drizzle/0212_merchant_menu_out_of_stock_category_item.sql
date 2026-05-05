-- Adds category-level and item-level out-of-stock state for merchant menu.
-- This is additive and backward-compatible with existing `in_stock` boolean on items.
--
-- Semantics:
-- - out_of_stock_manual = true => out of stock until cleared (ignores out_of_stock_until).
-- - out_of_stock_until (timestamptz) => out of stock while NOW() < out_of_stock_until.
-- - Effective in-stock for an item should consider BOTH item-level and category-level OOS,
--   plus existing `merchant_menu_items.in_stock`.

ALTER TABLE merchant_menu_categories
  ADD COLUMN IF NOT EXISTS out_of_stock_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS out_of_stock_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS out_of_stock_updated_at timestamptz NULL;

ALTER TABLE merchant_menu_items
  ADD COLUMN IF NOT EXISTS out_of_stock_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS out_of_stock_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS out_of_stock_updated_at timestamptz NULL;

-- Helpful indexes for "active OOS" checks. Partial indexes keep them small.
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

