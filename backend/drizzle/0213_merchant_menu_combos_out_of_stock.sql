-- Adds combo-level out-of-stock state for merchant menu combos.
-- Matches semantics of item/category out-of-stock columns:
-- - out_of_stock_manual = true => out of stock until cleared
-- - out_of_stock_until (timestamptz) => out of stock while NOW() < out_of_stock_until

ALTER TABLE merchant_menu_combos
  ADD COLUMN IF NOT EXISTS out_of_stock_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS out_of_stock_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS out_of_stock_updated_at timestamptz NULL;

-- Helpful indexes for active OOS checks.
CREATE INDEX IF NOT EXISTS merchant_menu_combos_oos_manual_idx
  ON merchant_menu_combos (store_id, id)
  WHERE out_of_stock_manual = true;

CREATE INDEX IF NOT EXISTS merchant_menu_combos_oos_until_idx
  ON merchant_menu_combos (store_id, out_of_stock_until)
  WHERE out_of_stock_until IS NOT NULL;

