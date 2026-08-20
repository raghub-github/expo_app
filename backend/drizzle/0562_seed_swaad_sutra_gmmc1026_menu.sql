-- =========================================================
-- SWAAD SUTRA — public store_id GMMC1026
-- Full menu seed aligned with dashboard MenuItemForm fields
-- Packaging ₹3 on every item (delivery)
-- Safe to re-run: skips duplicate items, updates existing rows
-- Resolves numeric merchant_stores.id from GMMC1026 (do not hardcode)
-- =========================================================

-- =========================================================
-- 0) Target store
-- =========================================================
CREATE TEMP TABLE _ss_gmmc1026 ON COMMIT DROP AS
SELECT ms.id AS store_id
FROM merchant_stores ms
WHERE ms.deleted_at IS NULL
  AND ms.store_id = 'GMMC1026'
LIMIT 1;

-- =========================================================
-- 1) CATEGORIES
-- =========================================================
INSERT INTO merchant_menu_categories (category_name, store_id, display_order, is_active, created_at, updated_at)
SELECT v.category_name, s.store_id, v.display_order, true, NOW(), NOW()
FROM _ss_gmmc1026 s
CROSS JOIN (
  VALUES
    ('North Indian Combos', 1),
    ('Rice & Biryani', 2),
    ('Gravies', 3),
    ('Breads', 4),
    ('Chinese', 5),
    ('Pizza', 6)
) AS v (category_name, display_order)
WHERE s.store_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM merchant_menu_categories c
    WHERE c.store_id = s.store_id
      AND lower(trim(c.category_name)) = lower(trim(v.category_name))
  );

-- =========================================================
-- 2) SEED DATA (all form-relevant columns)
-- packaging_charges: 3.00 on every item
-- =========================================================
CREATE TEMP TABLE _ss_gmmc1026_menu_seed ON COMMIT DROP AS
SELECT * FROM (VALUES
  -- category, item_name, food_type, cuisine, price, description, spice, prep_min, serves, serves_label, size_val, size_unit, packaging, tags, allergens, popular, recommended, weight_g, calories
  ('North Indian Combos','Chole Bhature','VEG','North Indian',69.00,
   'Two fluffy deep-fried bhature served with slow-cooked spicy chole (chickpea curry), onion salad and pickle. Hearty Punjabi breakfast plate.',
   'Medium',18,1,'1 person',1,'plate',3.00,
   ARRAY['chole','bhature','breakfast','punjabi','veg','bestseller'],ARRAY['gluten'],true,true,420,580),

  ('Rice & Biryani','Veg Pulao','VEG','North Indian',79.00,
   'Fragrant basmati rice cooked with mixed vegetables, whole spices and ghee. Light one-pot meal, served hot.',
   'Mild',18,1,'1 person',1,'plate',3.00,
   ARRAY['pulao','rice','veg','north-indian'],ARRAY[]::text[],false,true,350,420),

  ('Gravies','Mix Veg','VEG','North Indian',89.00,
   'Seasonal mixed vegetables (carrot, beans, cauliflower, peas) in a homestyle onion-tomato masala gravy. Pairs with roti or rice.',
   'Medium',18,1,'1 person',1,'plate',3.00,
   ARRAY['mixed-veg','gravy','curry','veg'],ARRAY[]::text[],false,false,320,360),

  ('Rice & Biryani','Veg Biryani','VEG','Biryani',99.00,
   'Layered dum-style vegetable biryani with basmati rice, mint, fried onions and whole spices. Served with raita on request.',
   'Medium',22,1,'1 person',1,'plate',3.00,
   ARRAY['biryani','veg','dum','bestseller'],ARRAY[]::text[],true,true,420,520),

  ('Breads','Aloo Paratha (2 Pc)','VEG','North Indian',59.00,
   'Two tawa-cooked whole-wheat parathas stuffed with spiced mashed potato. Served with curd and pickle.',
   'Mild',15,1,'1 person',2,'piece',3.00,
   ARRAY['paratha','aloo','breakfast','bread','veg'],ARRAY['gluten','dairy'],true,false,280,480),

  ('Chinese','Veg Noodles','VEG','Chinese',79.00,
   'Hakka-style noodles wok-tossed with cabbage, carrot, capsicum and spring onion in light soy. Indo-Chinese classic.',
   'Mild',16,1,'1 person',1,'plate',3.00,
   ARRAY['noodles','hakka','chinese','veg','indo-chinese'],ARRAY['gluten','soy'],false,true,320,380),

  ('Gravies','Dal Tadka','VEG','North Indian',69.00,
   'Yellow dal tempered with ghee, cumin, garlic, dried red chilli and coriander. Comfort North Indian dal.',
   'Medium',16,1,'1 person',1,'plate',3.00,
   ARRAY['dal','tadka','gravy','veg','north-indian'],ARRAY['dairy'],false,false,280,320),

  ('Rice & Biryani','Jeera Rice','VEG','North Indian',49.00,
   'Steamed basmati rice tempered with cumin and ghee. Simple aromatic side for gravies.',
   'Mild',12,1,'1 person',1,'plate',3.00,
   ARRAY['rice','jeera','side','veg'],ARRAY[]::text[],false,false,250,310),

  ('Gravies','Paneer Butter Masala','VEG','North Indian',119.00,
   'Soft paneer cubes in a rich tomato-butter-cream gravy. Restaurant-style North Indian bestseller.',
   'Mild',20,1,'1 person',1,'plate',3.00,
   ARRAY['paneer','butter-masala','gravy','bestseller','veg'],ARRAY['dairy'],true,true,350,480),

  ('Chinese','Veg Fried Rice','VEG','Chinese',89.00,
   'Wok-tossed rice with mixed vegetables, soy and spring onion. Classic Indo-Chinese fried rice.',
   'Mild',16,1,'1 person',1,'plate',3.00,
   ARRAY['fried-rice','chinese','veg','indo-chinese'],ARRAY['soy'],false,false,350,420),

  ('Pizza','Margherita Pizza','VEG','Italian',150.00,
   'Classic 7-inch Margherita pizza with tomato sauce, mozzarella and fresh basil on a thin crust.',
   'Mild',18,1,'1 person',7,'inches',3.00,
   ARRAY['pizza','margherita','veg','italian'],ARRAY['gluten','dairy'],true,true,280,520)
) AS t(
  category_name, item_name, food_type, cuisine_type, price,
  item_description, spice_level, preparation_time_minutes, serves, serves_label,
  item_size_value, item_size_unit, packaging_charges,
  item_tags, allergens, is_popular, is_recommended,
  weight_per_serving, calories_kcal
);

-- =========================================================
-- 3) INSERT new items (skip duplicates)
-- =========================================================
INSERT INTO merchant_menu_items (
  store_id, category_id, item_id, item_name, item_description,
  food_type, spice_level, cuisine_type,
  base_price, selling_price, discount_percentage, tax_percentage,
  in_stock, available_quantity, low_stock_threshold,
  has_customizations, has_addons, has_variants,
  is_popular, is_recommended,
  preparation_time_minutes, packaging_charges,
  serves, serves_label, item_size_value, item_size_unit,
  available_for_delivery,
  weight_per_serving, weight_per_serving_unit,
  calories_kcal, protein, protein_unit,
  carbohydrates, carbohydrates_unit, fat, fat_unit, fibre, fibre_unit,
  item_tags, allergens,
  is_active, is_deleted, display_order,
  item_metadata, nutritional_info,
  out_of_stock_manual, approval_status,
  created_at, updated_at
)
SELECT
  st.store_id,
  c.id,
  ('SS1026_' || substr(md5(st.store_id::text || lower(s.item_name)), 1, 16)),
  s.item_name,
  s.item_description,
  s.food_type,
  s.spice_level,
  s.cuisine_type,
  s.price,
  s.price,
  0::numeric(5, 2),
  0::numeric(5, 2),
  true,
  NULL,
  NULL,
  false,
  false,
  false,
  s.is_popular,
  s.is_recommended,
  s.preparation_time_minutes,
  s.packaging_charges,
  s.serves,
  s.serves_label,
  s.item_size_value,
  s.item_size_unit,
  true,
  s.weight_per_serving,
  'grams',
  s.calories_kcal,
  NULL, 'mg',
  NULL, 'mg',
  NULL, 'mg',
  NULL, 'mg',
  s.item_tags,
  s.allergens,
  true,
  false,
  0,
  '{}'::jsonb,
  '{}'::jsonb,
  false,
  'APPROVED'::merchant_menu_item_approval_status,
  NOW(),
  NOW()
FROM _ss_gmmc1026_menu_seed s
JOIN _ss_gmmc1026 st ON true
CROSS JOIN LATERAL (
  SELECT id
  FROM merchant_menu_categories c
  WHERE c.store_id = st.store_id
    AND lower(trim(c.category_name)) = lower(trim(s.category_name))
  LIMIT 1
) c
WHERE st.store_id IS NOT NULL
  AND c.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM merchant_menu_items mi
    WHERE mi.store_id = st.store_id
      AND lower(trim(mi.item_name)) = lower(trim(s.item_name))
  );

-- =========================================================
-- 4) UPDATE existing items with full form fields
-- =========================================================
UPDATE merchant_menu_items mi
SET
  item_description = s.item_description,
  food_type = s.food_type,
  spice_level = s.spice_level,
  cuisine_type = s.cuisine_type,
  base_price = s.price,
  selling_price = s.price,
  discount_percentage = 0,
  tax_percentage = 0,
  preparation_time_minutes = s.preparation_time_minutes,
  packaging_charges = s.packaging_charges,
  serves = s.serves,
  serves_label = s.serves_label,
  item_size_value = s.item_size_value,
  item_size_unit = s.item_size_unit,
  available_for_delivery = true,
  weight_per_serving = s.weight_per_serving,
  weight_per_serving_unit = 'grams',
  calories_kcal = s.calories_kcal,
  item_tags = s.item_tags,
  allergens = s.allergens,
  is_popular = s.is_popular,
  is_recommended = s.is_recommended,
  in_stock = true,
  is_active = true,
  approval_status = 'APPROVED'::merchant_menu_item_approval_status,
  updated_at = NOW()
FROM _ss_gmmc1026_menu_seed s
JOIN _ss_gmmc1026 st ON true
WHERE mi.store_id = st.store_id
  AND lower(trim(mi.item_name)) = lower(trim(s.item_name));
