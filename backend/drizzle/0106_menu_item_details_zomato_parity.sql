-- Menu item detail columns for Zomato-style add-item flow.
-- Adds: serving label, item size, delivery flag, structured nutritional info, predefined allergens.
-- Idempotent.

-- =============================================================================
-- Item-level new columns
-- =============================================================================

ALTER TABLE merchant_menu_items
  ADD COLUMN IF NOT EXISTS serves_label TEXT,
  ADD COLUMN IF NOT EXISTS item_size_value NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS item_size_unit TEXT,
  ADD COLUMN IF NOT EXISTS available_for_delivery BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS weight_per_serving NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS weight_per_serving_unit TEXT DEFAULT 'grams',
  ADD COLUMN IF NOT EXISTS calories_kcal NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS protein NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS protein_unit TEXT DEFAULT 'mg',
  ADD COLUMN IF NOT EXISTS carbohydrates NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS carbohydrates_unit TEXT DEFAULT 'mg',
  ADD COLUMN IF NOT EXISTS fat NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS fat_unit TEXT DEFAULT 'mg',
  ADD COLUMN IF NOT EXISTS fibre NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS fibre_unit TEXT DEFAULT 'mg',
  ADD COLUMN IF NOT EXISTS item_tags TEXT[] DEFAULT '{}';

COMMENT ON COLUMN merchant_menu_items.serves_label IS 'e.g. "1 person", "1-2 people"';
COMMENT ON COLUMN merchant_menu_items.item_size_unit IS 'slices, kg, litre, ml, serves, cms, piece, grams, inches';
COMMENT ON COLUMN merchant_menu_items.item_tags IS 'Flat array of tag strings, e.g. {"Freshly Frosted","Vegan","Medium Spicy"}';
