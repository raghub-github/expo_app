-- =============================================================================
-- Unified Catalog Engine - Seed + Backfill for FOOD
-- -----------------------------------------------------------------------------
-- Creates initial schema-driven definitions so:
-- - FOOD clients remain backwards compatible (legacy columns still exist)
-- - unified API can start returning `attributes` from `item_attributes`
--
-- This migration is idempotent:
-- - store_type_config upserts
-- - attribute_definitions upserts
-- - item_attributes backfill uses ON CONFLICT upserts
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Store type config seed
-- -----------------------------------------------------------------------------
INSERT INTO store_type_config (
  store_type,
  enable_addons,
  enable_combos,
  enable_expiry,
  enable_prescription,
  enable_weight
)
VALUES
  ('GENERAL'::store_type, true, true, false, false, true),
  ('FOOD'::store_type, true, true, false, false, true),
  ('GROCERY'::store_type, true, false, false, false, true),
  ('RESTAURANT'::store_type, true, true, false, false, true),
  ('CLOUD_KITCHEN'::store_type, true, true, false, false, true),
  ('WAREHOUSE'::store_type, true, true, false, false, true),
  ('STORE'::store_type, true, true, false, false, true),
  ('GARAGE'::store_type, true, true, false, false, true),
  ('PHARMA'::store_type, false, false, true, true, true),
  ('STATIONERY'::store_type, true, true, false, false, true)
ON CONFLICT (store_type) DO UPDATE SET
  enable_addons = EXCLUDED.enable_addons,
  enable_combos = EXCLUDED.enable_combos,
  enable_expiry = EXCLUDED.enable_expiry,
  enable_prescription = EXCLUDED.enable_prescription,
  enable_weight = EXCLUDED.enable_weight;

-- -----------------------------------------------------------------------------
-- 2) Attribute definition seed (minimum to cover existing FOOD schema)
-- -----------------------------------------------------------------------------
-- FOOD attributes (derived from merchant_menu_items legacy columns)
INSERT INTO attribute_definitions (
  store_type,
  attribute_name,
  data_type,
  required,
  validation_rules,
  selection_metadata
)
VALUES
  ('FOOD'::store_type, 'food_type', 'enum', false, '{"allowed_values":["VEG","NON_VEG","VEGAN","EGG"]}'::jsonb, '{}'::jsonb),
  ('FOOD'::store_type, 'spice_level', 'enum', false, '{"allowed_values":["MILD","MEDIUM","HOT","EXTRA_HOT"]}'::jsonb, '{}'::jsonb),
  ('FOOD'::store_type, 'cuisine_type', 'string', false, '{}'::jsonb, '{}'::jsonb),

  ('FOOD'::store_type, 'serves', 'number', false, '{}'::jsonb, '{}'::jsonb),
  ('FOOD'::store_type, 'serves_label', 'string', false, '{}'::jsonb, '{}'::jsonb),

  ('FOOD'::store_type, 'item_size_value', 'number', false, '{}'::jsonb, '{}'::jsonb),
  ('FOOD'::store_type, 'item_size_unit', 'string', false, '{}'::jsonb, '{}'::jsonb),

  ('FOOD'::store_type, 'available_for_delivery', 'boolean', false, '{}'::jsonb, '{}'::jsonb),

  ('FOOD'::store_type, 'weight_per_serving', 'number', false, '{}'::jsonb, '{}'::jsonb),
  ('FOOD'::store_type, 'weight_per_serving_unit', 'string', false, '{}'::jsonb, '{}'::jsonb),

  ('FOOD'::store_type, 'calories_kcal', 'number', false, '{}'::jsonb, '{}'::jsonb),
  ('FOOD'::store_type, 'protein', 'number', false, '{}'::jsonb, '{}'::jsonb),
  ('FOOD'::store_type, 'protein_unit', 'string', false, '{}'::jsonb, '{}'::jsonb),
  ('FOOD'::store_type, 'carbohydrates', 'number', false, '{}'::jsonb, '{}'::jsonb),
  ('FOOD'::store_type, 'carbohydrates_unit', 'string', false, '{}'::jsonb, '{}'::jsonb),
  ('FOOD'::store_type, 'fat', 'number', false, '{}'::jsonb, '{}'::jsonb),
  ('FOOD'::store_type, 'fat_unit', 'string', false, '{}'::jsonb, '{}'::jsonb),
  ('FOOD'::store_type, 'fibre', 'number', false, '{}'::jsonb, '{}'::jsonb),
  ('FOOD'::store_type, 'fibre_unit', 'string', false, '{}'::jsonb, '{}'::jsonb),

  ('FOOD'::store_type, 'allergens', 'string', false, '{"is_array":true}'::jsonb, '{}'::jsonb),
  ('FOOD'::store_type, 'item_tags', 'string', false, '{"is_array":true}'::jsonb, '{}'::jsonb)
ON CONFLICT (store_type, attribute_name) DO UPDATE SET
  data_type = EXCLUDED.data_type,
  required = EXCLUDED.required,
  validation_rules = EXCLUDED.validation_rules,
  selection_metadata = EXCLUDED.selection_metadata,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- 3) Minimal attribute seed for PHARMA / GROCERY (for future validation)
-- -----------------------------------------------------------------------------
-- Pharma: expiry date + prescription flag required
INSERT INTO attribute_definitions (
  store_type,
  attribute_name,
  data_type,
  required,
  validation_rules,
  selection_metadata
)
VALUES
  ('PHARMA'::store_type, 'expiry_date', 'date', true, '{}'::jsonb, '{}'::jsonb),
  ('PHARMA'::store_type, 'requires_prescription', 'boolean', true, '{}'::jsonb, '{}'::jsonb),
  ('PHARMA'::store_type, 'drug_strength', 'string', false, '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (store_type, attribute_name) DO UPDATE SET
  data_type = EXCLUDED.data_type,
  required = EXCLUDED.required,
  validation_rules = EXCLUDED.validation_rules,
  selection_metadata = EXCLUDED.selection_metadata,
  updated_at = now();

-- Grocery: quantity/weight required (model as quantity_value + quantity_unit)
INSERT INTO attribute_definitions (
  store_type,
  attribute_name,
  data_type,
  required,
  validation_rules,
  selection_metadata
)
VALUES
  ('GROCERY'::store_type, 'quantity_value', 'number', true, '{}'::jsonb, '{}'::jsonb),
  ('GROCERY'::store_type, 'quantity_unit', 'string', true, '{}'::jsonb, '{}'::jsonb),
  ('GROCERY'::store_type, 'weight_value', 'number', false, '{}'::jsonb, '{}'::jsonb),
  ('GROCERY'::store_type, 'weight_unit', 'string', false, '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (store_type, attribute_name) DO UPDATE SET
  data_type = EXCLUDED.data_type,
  required = EXCLUDED.required,
  validation_rules = EXCLUDED.validation_rules,
  selection_metadata = EXCLUDED.selection_metadata,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- 4) Backfill item_attributes for existing FOOD items
-- -----------------------------------------------------------------------------
-- Strategy:
-- - Only backfill when merchant_store.store_type = 'FOOD'
-- - Only insert rows where the legacy column is NOT NULL
-- - Upsert on (item_id, attribute_id)

-- food_type
INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT
  m.id AS item_id,
  (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'food_type' LIMIT 1) AS attribute_id,
  to_jsonb(m.food_type) AS value
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.food_type IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- spice_level
INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT
  m.id,
  (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'spice_level' LIMIT 1),
  to_jsonb(m.spice_level)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.spice_level IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- cuisine_type
INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT
  m.id,
  (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'cuisine_type' LIMIT 1),
  to_jsonb(m.cuisine_type)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.cuisine_type IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- serves
INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT
  m.id,
  (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'serves' LIMIT 1),
  to_jsonb(m.serves)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.serves IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- serves_label
INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT
  m.id,
  (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'serves_label' LIMIT 1),
  to_jsonb(m.serves_label)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.serves_label IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- item_size_value / item_size_unit
INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT
  m.id,
  (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'item_size_value' LIMIT 1),
  to_jsonb(m.item_size_value)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.item_size_value IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT
  m.id,
  (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'item_size_unit' LIMIT 1),
  to_jsonb(m.item_size_unit)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.item_size_unit IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- available_for_delivery
INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT
  m.id,
  (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'available_for_delivery' LIMIT 1),
  to_jsonb(m.available_for_delivery)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.available_for_delivery IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- weight_per_serving + unit
INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT
  m.id,
  (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'weight_per_serving' LIMIT 1),
  to_jsonb(m.weight_per_serving)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.weight_per_serving IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT
  m.id,
  (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'weight_per_serving_unit' LIMIT 1),
  to_jsonb(m.weight_per_serving_unit)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.weight_per_serving_unit IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- nutrition (numbers)
INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT m.id,
       (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'calories_kcal' LIMIT 1),
       to_jsonb(m.calories_kcal)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.calories_kcal IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT m.id,
       (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'protein' LIMIT 1),
       to_jsonb(m.protein)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.protein IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT m.id,
       (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'carbohydrates' LIMIT 1),
       to_jsonb(m.carbohydrates)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.carbohydrates IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT m.id,
       (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'fat' LIMIT 1),
       to_jsonb(m.fat)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.fat IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT m.id,
       (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'fibre' LIMIT 1),
       to_jsonb(m.fibre)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.fibre IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- nutrition units (strings)
INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT m.id,
       (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'protein_unit' LIMIT 1),
       to_jsonb(m.protein_unit)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.protein_unit IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT m.id,
       (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'carbohydrates_unit' LIMIT 1),
       to_jsonb(m.carbohydrates_unit)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.carbohydrates_unit IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT m.id,
       (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'fat_unit' LIMIT 1),
       to_jsonb(m.fat_unit)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.fat_unit IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT m.id,
       (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'fibre_unit' LIMIT 1),
       to_jsonb(m.fibre_unit)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.fibre_unit IS NOT NULL
ON CONFLICT (item_id, attribute_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- allergens + item_tags (text[])
INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT m.id,
       (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'allergens' LIMIT 1),
       to_jsonb(m.allergens)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.allergens IS NOT NULL
  AND array_length(m.allergens, 1) > 0
ON CONFLICT (item_id, attribute_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

INSERT INTO item_attributes (item_id, attribute_id, value)
SELECT m.id,
       (SELECT id FROM attribute_definitions ad WHERE ad.store_type = 'FOOD'::store_type AND ad.attribute_name = 'item_tags' LIMIT 1),
       to_jsonb(m.item_tags)
FROM merchant_menu_items m
INNER JOIN merchant_stores s ON s.id = m.store_id
WHERE s.store_type = 'FOOD'::store_type
  AND m.item_tags IS NOT NULL
  AND array_length(m.item_tags, 1) > 0
ON CONFLICT (item_id, attribute_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

