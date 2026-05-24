-- =========================================================
-- HOT CHAPPATHIS — Store internal id 77
-- Full menu seed aligned with dashboard MenuItemForm fields
-- Packaging ₹5 only on delivery/main dishes (NULL otherwise)
-- Safe to re-run: skips duplicate items, updates existing rows
-- =========================================================

-- =========================================================
-- 1) CATEGORIES
-- =========================================================
INSERT INTO merchant_menu_categories (category_name, store_id, display_order, is_active, created_at, updated_at)
SELECT v.category_name, v.store_id, v.display_order, true, NOW(), NOW()
FROM (
  VALUES
    ('Raitha & Salad', 77, 1),
    ('Chapati', 77, 2),
    ('Biriyani', 77, 3),
    ('Breads', 77, 4),
    ('Meals', 77, 5),
    ('Chinese Rice', 77, 6),
    ('Chinese Noodles', 77, 7),
    ('All Time Favorite', 77, 8),
    ('Indian Gravy', 77, 9),
    ('Chinese Gravy & Dry', 77, 10)
) AS v (category_name, store_id, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM merchant_menu_categories c
  WHERE c.store_id = v.store_id
    AND lower(trim(c.category_name)) = lower(trim(v.category_name))
);

-- =========================================================
-- 2) SEED DATA (all form-relevant columns)
-- packaging_charges: NULL = off | 5 = per-item packaging enabled
-- =========================================================
CREATE TEMP TABLE _hc77_menu_seed ON COMMIT DROP AS
SELECT * FROM (VALUES
  -- category, item_name, food_type, cuisine, price, description, spice, prep_min, serves, serves_label, size_val, size_unit, packaging, tags, allergens, popular, recommended, weight_g, calories
  -- RAITHA & SALAD
  ('Raitha & Salad','Onion Salad','VEG','North Indian',30.00,'Freshly sliced raw onion salad served as a crunchy side with meals. Light, refreshing and pairs well with biryani and paratha.', 'Mild',10,1,'1 person',1,'plate',NULL,ARRAY['salad','side','veg','north-indian'],ARRAY[]::text[],false,false,80,25),
  ('Raitha & Salad','Onion Raitha','VEG','North Indian',40.00,'Thick curd blended with finely chopped onion and mild spices. Cooling side dish for spicy mains.', 'Mild',10,1,'1 person',150,'grams',NULL,ARRAY['raitha','side','curd','veg'],ARRAY['dairy'],false,false,150,90),
  ('Raitha & Salad','Mix Veg Raitha','VEG','North Indian',50.00,'Fresh curd mixed with chopped cucumber, carrot, onion and coriander. Creamy restaurant-style raitha.', 'Mild',10,1,'1 person',150,'grams',NULL,ARRAY['raitha','side','curd','veg'],ARRAY['dairy'],false,false,160,95),
  ('Raitha & Salad','Boondhi Raitha','VEG','North Indian',50.00,'Crispy boondhi soaked in seasoned curd with roasted cumin. Classic North Indian accompaniment.', 'Mild',10,1,'1 person',150,'grams',NULL,ARRAY['raitha','side','curd','veg'],ARRAY['dairy'],false,false,170,110),
  ('Raitha & Salad','Masala Papped','VEG','North Indian',35.00,'Crisp roasted papad topped with chopped onion, tomato and masala. Quick crunchy starter.', 'Medium',8,1,'1 person',1,'piece',NULL,ARRAY['starter','papad','crispy','veg'],ARRAY[]::text[],false,false,30,60),
  ('Raitha & Salad','Green Salad','VEG','North Indian',45.00,'Fresh lettuce, cucumber, tomato and onion with lemon. Healthy side salad.', 'Mild',8,1,'1 person',1,'plate',NULL,ARRAY['salad','healthy','side','veg'],ARRAY[]::text[],false,false,120,35),
  ('Raitha & Salad','Butter Milk','VEG','Beverages',30.00,'Chilled spiced buttermilk (chaas) tempered with curry leaves and ginger. Refreshing drink.', 'Mild',5,1,'1 person',250,'ml',NULL,ARRAY['beverage','buttermilk','drink','veg'],ARRAY['dairy'],false,false,250,45),
  ('Raitha & Salad','Sweet Lassi','VEG','Beverages',50.00,'Thick sweet yogurt drink blended with sugar. Served chilled.', 'Mild',5,1,'1 person',300,'ml',NULL,ARRAY['beverage','lassi','sweet','drink'],ARRAY['dairy'],false,false,300,180),
  ('Raitha & Salad','Salt Lassi','VEG','Beverages',50.00,'Savory salted yogurt drink with roasted cumin. Traditional Punjabi style lassi.', 'Mild',5,1,'1 person',300,'ml',NULL,ARRAY['beverage','lassi','drink','veg'],ARRAY['dairy'],false,false,300,120),
  ('Raitha & Salad','Tea','VEG','Beverages',10.00,'Hot masala chai brewed with milk and spices. Perfect with breakfast or snacks.', 'Mild',5,1,'1 person',150,'ml',NULL,ARRAY['beverage','tea','hot-drink'],ARRAY['dairy'],true,false,150,40),
  ('Raitha & Salad','Milk','VEG','Beverages',15.00,'Plain hot or warm milk. Simple and comforting.', 'Mild',5,1,'1 person',200,'ml',NULL,ARRAY['beverage','milk','hot-drink'],ARRAY['dairy'],false,false,200,120),
  ('Raitha & Salad','Coffee','VEG','Beverages',15.00,'South Indian filter coffee with milk. Strong and aromatic.', 'Mild',5,1,'1 person',150,'ml',NULL,ARRAY['beverage','coffee','hot-drink'],ARRAY['dairy'],false,false,150,50),

  -- CHAPATI
  ('Chapati','1 Plain Chapati','VEG','North Indian',15.00,'Single soft whole-wheat chapati cooked on tawa. Staple Indian bread.', 'Mild',10,1,'1 person',1,'piece',NULL,ARRAY['bread','chapati','tawa','veg'],ARRAY['gluten'],false,false,40,80),
  ('Chapati','2 Chapati With Gravy','VEG','North Indian',40.00,'Two fresh chapatis served with a small portion of veg gravy. Filling mini meal.', 'Mild',15,1,'1 person',2,'piece',5.00,ARRAY['combo','chapati','gravy','veg'],ARRAY['gluten'],false,false,180,220),
  ('Chapati','Paratha Kurma','VEG','North Indian',30.00,'Flaky paratha paired with mildly spiced vegetable kurma gravy.', 'Mild',15,1,'1 person',1,'plate',5.00,ARRAY['paratha','kurma','veg','north-indian'],ARRAY['gluten','dairy'],false,false,200,280),
  ('Chapati','Chola Poori','VEG','North Indian',60.00,'Fluffy deep-fried pooris with spiced chola (chickpea) curry. Hearty North Indian plate.', 'Medium',18,1,'1 person',1,'plate',5.00,ARRAY['poori','chola','breakfast','veg'],ARRAY['gluten'],true,false,320,420),
  ('Chapati','Poori Channa','VEG','South Indian',60.00,'Crisp pooris with South Indian style channa masala. Popular breakfast combo.', 'Medium',18,1,'1 person',1,'plate',5.00,ARRAY['poori','channa','south-indian','veg'],ARRAY['gluten'],false,true,310,400),

  -- BIRIYANI
  ('Biriyani','Chicken Biryani','NON_VEG','Biryani',120.00,'Fragrant basmati rice layered with tender chicken, whole spices and fried onions. Dum-style house biryani.', 'Medium',25,1,'1 person',1,'plate',5.00,ARRAY['biryani','chicken','non-veg','bestseller'],ARRAY[]::text[],true,true,450,680),
  ('Biriyani','Egg Biryani','EGG','Biryani',100.00,'Aromatic basmati rice cooked with boiled eggs, mint, coriander and biryani masala.', 'Medium',22,1,'1 person',1,'plate',5.00,ARRAY['biryani','egg','eggitarian'],ARRAY['egg'],false,false,400,550),
  ('Biriyani','Paneer Biryani','VEG','Biryani',110.00,'Soft paneer cubes in spiced dum biryani rice with saffron and fried onions.', 'Medium',22,1,'1 person',1,'plate',5.00,ARRAY['biryani','paneer','veg'],ARRAY['dairy'],true,false,420,620),
  ('Biriyani','Mushroom Biryani','VEG','Biryani',110.00,'Earthy mushrooms tossed in biryani masala and slow-cooked with basmati rice.', 'Medium',22,1,'1 person',1,'plate',5.00,ARRAY['biryani','mushroom','veg'],ARRAY[]::text[],false,false,380,480),

  -- CHINESE RICE
  ('Chinese Rice','Veg Fried Rice','VEG','Chinese',90.00,'Wok-tossed rice with mixed vegetables, soy and spring onion. Indo-Chinese classic.', 'Mild',18,1,'1 person',1,'plate',5.00,ARRAY['fried-rice','chinese','veg','indo-chinese'],ARRAY['soy'],false,false,350,420),
  ('Chinese Rice','Gobi Fried Rice','VEG','Chinese',90.00,'Fried rice with crispy cauliflower florets and Chinese sauces. Vegetarian favorite.', 'Medium',18,1,'1 person',1,'plate',5.00,ARRAY['fried-rice','gobi','chinese','veg'],ARRAY['soy'],false,false,340,400),
  ('Chinese Rice','Paneer Fried Rice','VEG','Chinese',110.00,'Soft paneer cubes stir-fried with rice, capsicum and Indo-Chinese sauces.', 'Mild',18,1,'1 person',1,'plate',5.00,ARRAY['fried-rice','paneer','chinese','veg'],ARRAY['dairy','soy'],false,false,380,480),
  ('Chinese Rice','Egg Fried Rice','EGG','Chinese',100.00,'Fluffy rice tossed with scrambled egg, vegetables and soy. Quick satisfying meal.', 'Mild',18,1,'1 person',1,'plate',5.00,ARRAY['fried-rice','egg','chinese'],ARRAY['egg','soy'],false,false,360,450),
  ('Chinese Rice','Chicken Fried Rice','NON_VEG','Chinese',120.00,'Juicy chicken pieces wok-fried with rice, veggies and Chinese seasonings.', 'Medium',20,1,'1 person',1,'plate',5.00,ARRAY['fried-rice','chicken','chinese','non-veg'],ARRAY['soy'],true,false,400,520),
  ('Chinese Rice','Mushroom Fried Rice','VEG','Chinese',110.00,'Mushroom and vegetable fried rice with garlic and pepper notes.', 'Mild',18,1,'1 person',1,'plate',5.00,ARRAY['fried-rice','mushroom','chinese','veg'],ARRAY['soy'],false,false,350,410),

  -- CHINESE NOODLES
  ('Chinese Noodles','Veg Noodles','VEG','Chinese',80.00,'Stir-fried hakka-style noodles with cabbage, carrot and capsicum.', 'Mild',18,1,'1 person',1,'plate',5.00,ARRAY['noodles','hakka','chinese','veg'],ARRAY['gluten','soy'],false,false,320,380),
  ('Chinese Noodles','Gobi Noodles','VEG','Chinese',80.00,'Noodles tossed with crispy gobi and Indo-Chinese sauces.', 'Medium',18,1,'1 person',1,'plate',5.00,ARRAY['noodles','gobi','chinese','veg'],ARRAY['gluten','soy'],false,false,330,390),
  ('Chinese Noodles','Paneer Noodles','VEG','Chinese',100.00,'Soft paneer and vegetables tossed with seasoned noodles.', 'Mild',18,1,'1 person',1,'plate',5.00,ARRAY['noodles','paneer','chinese','veg'],ARRAY['gluten','dairy','soy'],false,false,360,450),
  ('Chinese Noodles','Egg Noodles','EGG','Chinese',90.00,'Egg noodles stir-fried with vegetables and soy sauce.', 'Mild',18,1,'1 person',1,'plate',5.00,ARRAY['noodles','egg','chinese'],ARRAY['egg','gluten','soy'],false,false,340,420),
  ('Chinese Noodles','Chicken Noodles','NON_VEG','Chinese',110.00,'Chicken and vegetable hakka noodles with bold Indo-Chinese flavor.', 'Medium',20,1,'1 person',1,'plate',5.00,ARRAY['noodles','chicken','chinese','non-veg'],ARRAY['gluten','soy'],true,false,380,500),
  ('Chinese Noodles','Mushroom Noodles','VEG','Chinese',100.00,'Mushroom and veg noodles with garlic, pepper and soy.', 'Mild',18,1,'1 person',1,'plate',5.00,ARRAY['noodles','mushroom','chinese','veg'],ARRAY['gluten','soy'],false,false,330,400),

  -- BREADS
  ('Breads','Aloo Paratha','VEG','North Indian',30.00,'Stuffed whole-wheat paratha filled with spiced mashed potato. Served with curd/pickle.', 'Mild',15,1,'1 person',1,'piece',5.00,ARRAY['paratha','aloo','breakfast','veg'],ARRAY['gluten'],false,false,120,220),
  ('Breads','Gobi Paratha','VEG','North Indian',35.00,'Paratha stuffed with seasoned cauliflower filling. Tawa cooked with ghee.', 'Mild',15,1,'1 person',1,'piece',5.00,ARRAY['paratha','gobi','breakfast','veg'],ARRAY['gluten','dairy'],false,false,125,210),
  ('Breads','Paneer Paratha','VEG','North Indian',45.00,'Rich paneer and spice stuffing inside flaky paratha. Popular Punjabi bread.', 'Mild',15,1,'1 person',1,'piece',5.00,ARRAY['paratha','paneer','breakfast','veg'],ARRAY['gluten','dairy'],true,false,140,280),
  ('Breads','Onion Paratha','VEG','North Indian',35.00,'Paratha stuffed with caramelized onion and green chilli. Savory and filling.', 'Medium',15,1,'1 person',1,'piece',5.00,ARRAY['paratha','onion','breakfast','veg'],ARRAY['gluten'],false,false,120,200),
  ('Breads','Mix Veg Paratha','VEG','North Indian',45.00,'Mixed vegetable stuffed paratha with carrot, beans and spices.', 'Mild',15,1,'1 person',1,'piece',5.00,ARRAY['paratha','mixed-veg','breakfast','veg'],ARRAY['gluten'],false,false,130,230),
  ('Breads','Plain Paratha','VEG','North Indian',15.00,'Simple layered plain paratha cooked on tawa. No stuffing.', 'Mild',10,1,'1 person',1,'piece',NULL,ARRAY['paratha','plain','bread','veg'],ARRAY['gluten'],false,false,90,150),
  ('Breads','Mulli Paratha','VEG','North Indian',35.00,'Radish (mulli) stuffed paratha with ajwain and green chilli.', 'Medium',15,1,'1 person',1,'piece',5.00,ARRAY['paratha','mulli','breakfast','veg'],ARRAY['gluten'],false,false,125,210),
  ('Breads','Egg Paratha','EGG','North Indian',35.00,'Paratha folded with spiced egg omelette filling. Protein-rich breakfast.', 'Medium',15,1,'1 person',1,'piece',5.00,ARRAY['paratha','egg','breakfast'],ARRAY['egg','gluten'],false,false,140,260),
  ('Breads','Chicken Paratha','NON_VEG','North Indian',45.00,'Minced chicken stuffed paratha with garam masala. Hearty non-veg bread.', 'Medium',18,1,'1 person',1,'piece',5.00,ARRAY['paratha','chicken','non-veg','breakfast'],ARRAY['gluten'],false,false,160,300),

  -- ALL TIME FAVORITE
  ('All Time Favorite','Gobi 65','VEG','Chinese',90.00,'Crispy batter-fried cauliflower tossed in spicy 65 masala. Iconic starter.', 'Hot',15,1,'1 person',1,'plate',5.00,ARRAY['starter','65','gobi','spicy','veg'],ARRAY[]::text[],true,true,250,320),
  ('All Time Favorite','Paneer 65','VEG','Chinese',110.00,'Golden fried paneer cubes in tangy spicy 65 sauce. Crowd favorite.', 'Hot',15,1,'1 person',1,'plate',5.00,ARRAY['starter','65','paneer','spicy','veg'],ARRAY['dairy'],true,false,280,380),
  ('All Time Favorite','Mushroom 65','VEG','Chinese',110.00,'Crispy mushroom fritters tossed in South Indian 65 masala.', 'Hot',15,1,'1 person',1,'plate',5.00,ARRAY['starter','65','mushroom','spicy','veg'],ARRAY[]::text[],false,false,240,300),
  ('All Time Favorite','Aloo Pepper Fry','VEG','North Indian',90.00,'Potato strips stir-fried with black pepper and curry leaves. Simple spicy side.', 'Medium',15,1,'1 person',1,'plate',5.00,ARRAY['starter','aloo','pepper','veg'],ARRAY[]::text[],false,false,220,280),
  ('All Time Favorite','Egg Bhuji','EGG','North Indian',50.00,'Soft scrambled eggs with onion, tomato and Indian spices. Homestyle egg dish.', 'Medium',12,1,'1 person',1,'plate',5.00,ARRAY['egg','bhurji','breakfast'],ARRAY['egg'],false,false,150,220),
  ('All Time Favorite','Bread Omlette','EGG','Fast Food',40.00,'Fluffy omelette sandwiched between toasted bread slices. Quick snack.', 'Mild',10,1,'1 person',1,'piece',5.00,ARRAY['egg','sandwich','snack','fast-food'],ARRAY['egg','gluten'],false,false,180,350),
  ('All Time Favorite','Chilly Paratha','VEG','Chinese',80.00,'Paratha strips tossed with capsicum and Indo-Chinese chilly sauce.', 'Hot',15,1,'1 person',1,'plate',5.00,ARRAY['paratha','chilly','chinese','veg'],ARRAY['gluten','soy'],false,false,260,340),
  ('All Time Favorite','Chicken 65','NON_VEG','Chinese',120.00,'Juicy fried chicken bites in classic spicy 65 masala. Restaurant signature starter.', 'Hot',18,1,'1 person',1,'plate',5.00,ARRAY['starter','65','chicken','spicy','bestseller','non-veg'],ARRAY[]::text[],true,true,300,420),
  ('All Time Favorite','Omlette Double','EGG','Fast Food',30.00,'Double egg plain omelette. High protein quick bite.', 'Mild',10,1,'1 person',1,'plate',5.00,ARRAY['egg','omelette','breakfast','fast-food'],ARRAY['egg'],false,false,120,240),

  -- INDIAN GRAVY
  ('Indian Gravy','Dhall Fry','VEG','North Indian',90.00,'Tempered yellow dal with garlic, red chilli and curry leaves. Comfort homestyle dal.', 'Medium',18,1,'1 person',1,'plate',5.00,ARRAY['dal','gravy','veg','north-indian'],ARRAY[]::text[],false,false,280,320),
  ('Indian Gravy','Dhall Tadka','VEG','North Indian',100.00,'Creamy dal with ghee tadka of cumin, garlic and tomatoes. North Indian classic.', 'Medium',18,1,'1 person',1,'plate',5.00,ARRAY['dal','tadka','gravy','veg'],ARRAY['dairy'],false,false,300,350),
  ('Indian Gravy','Paneer Butter Masala','VEG','North Indian',150.00,'Soft paneer cubes in rich tomato-butter-cream gravy. North Indian bestseller.', 'Mild',20,1,'1 person',1,'plate',5.00,ARRAY['paneer','gravy','butter-masala','bestseller','veg'],ARRAY['dairy'],true,true,350,480),
  ('Indian Gravy','Kadai Paneer','VEG','North Indian',160.00,'Paneer and capsicum in thick kadai masala with coriander seeds. Semi-dry gravy.', 'Medium',20,1,'1 person',1,'plate',5.00,ARRAY['paneer','kadai','gravy','veg'],ARRAY['dairy'],true,false,340,460),
  ('Indian Gravy','Kadai Veg','VEG','North Indian',140.00,'Mixed vegetables cooked in kadai masala with onion and capsicum.', 'Medium',20,1,'1 person',1,'plate',5.00,ARRAY['mixed-veg','kadai','gravy','veg'],ARRAY[]::text[],false,false,320,380),
  ('Indian Gravy','Aloo Gopi Masala','VEG','North Indian',130.00,'Potato and cauliflower in onion-tomato masala gravy. Everyday home-style curry.', 'Medium',18,1,'1 person',1,'plate',5.00,ARRAY['aloo','gobi','gravy','veg'],ARRAY[]::text[],false,false,300,350),
  ('Indian Gravy','Mix Veg Masala','VEG','North Indian',140.00,'Seasonal mixed vegetables in spiced onion-tomato gravy.', 'Medium',18,1,'1 person',1,'plate',5.00,ARRAY['mixed-veg','gravy','veg'],ARRAY[]::text[],false,false,310,360),
  ('Indian Gravy','Palak Paneer','VEG','North Indian',160.00,'Paneer cubes in smooth spinach puree with cream and spices.', 'Mild',20,1,'1 person',1,'plate',5.00,ARRAY['palak','paneer','gravy','veg'],ARRAY['dairy'],true,false,340,420),
  ('Indian Gravy','Mushroom Masala','VEG','North Indian',150.00,'Button mushrooms in rich onion-tomato masala gravy.', 'Medium',18,1,'1 person',1,'plate',5.00,ARRAY['mushroom','gravy','veg'],ARRAY[]::text[],false,false,280,340),
  ('Indian Gravy','Egg Curry (2 ps)','EGG','North Indian',100.00,'Two boiled eggs in spiced onion-tomato curry. Served with gravy.', 'Medium',18,1,'1 person',2,'piece',5.00,ARRAY['egg','curry','gravy'],ARRAY['egg'],false,false,250,320),
  ('Indian Gravy','Butter Chicken','NON_VEG','North Indian',150.00,'Tender chicken in silky tomato-butter-cream gravy. Restaurant signature.', 'Mild',22,1,'1 person',1,'plate',5.00,ARRAY['chicken','butter-chicken','gravy','bestseller','non-veg'],ARRAY['dairy'],true,true,380,520),
  ('Indian Gravy','Kadai Chicken','NON_VEG','North Indian',150.00,'Boneless chicken with capsicum in robust kadai masala. Semi-dry style.', 'Medium',22,1,'1 person',1,'plate',5.00,ARRAY['chicken','kadai','gravy','non-veg'],ARRAY[]::text[],true,false,360,480),

  -- CHINESE GRAVY & DRY
  ('Chinese Gravy & Dry','Gobi Manchurian','VEG','Chinese',100.00,'Crispy cauliflower in tangy Manchurian gravy. Indo-Chinese favorite.', 'Medium',18,1,'1 person',1,'plate',5.00,ARRAY['manchurian','gobi','chinese','veg'],ARRAY['soy'],true,true,300,380),
  ('Chinese Gravy & Dry','Paneer Manchurian','VEG','Chinese',130.00,'Fried paneer in sweet-spicy Manchurian sauce with spring onion.', 'Medium',18,1,'1 person',1,'plate',5.00,ARRAY['manchurian','paneer','chinese','veg'],ARRAY['dairy','soy'],true,false,320,420),
  ('Chinese Gravy & Dry','Mushroom Manchurian','VEG','Chinese',150.00,'Mushroom fritters in thick Manchurian gravy. Rich vegetarian main.', 'Medium',18,1,'1 person',1,'plate',5.00,ARRAY['manchurian','mushroom','chinese','veg'],ARRAY['soy'],false,false,290,360),
  ('Chinese Gravy & Dry','Chilly Gobi','VEG','Chinese',110.00,'Crispy gobi tossed in dry chilly garlic sauce. Spicy starter.', 'Hot',18,1,'1 person',1,'plate',5.00,ARRAY['chilly','gobi','chinese','spicy','veg'],ARRAY['soy'],false,false,280,350),
  ('Chinese Gravy & Dry','Chilly Paneer','VEG','Chinese',160.00,'Paneer cubes in dry chilly sauce with capsicum and onion.', 'Hot',18,1,'1 person',1,'plate',5.00,ARRAY['chilly','paneer','chinese','spicy','veg'],ARRAY['dairy','soy'],true,false,340,450),
  ('Chinese Gravy & Dry','Chilly Mushroom','VEG','Chinese',160.00,'Mushroom and peppers in dry Indo-Chinese chilly sauce.', 'Hot',18,1,'1 person',1,'plate',5.00,ARRAY['chilly','mushroom','chinese','spicy','veg'],ARRAY['soy'],false,false,300,380),
  ('Chinese Gravy & Dry','Chicken Manchurian','NON_VEG','Chinese',120.00,'Crispy chicken in classic Manchurian gravy. Popular combo partner.', 'Medium',20,1,'1 person',1,'plate',5.00,ARRAY['manchurian','chicken','chinese','non-veg'],ARRAY['soy'],true,false,350,480),
  ('Chinese Gravy & Dry','Chilly Chicken','NON_VEG','Chinese',130.00,'Dry chilly chicken with onion, capsicum and soy. Spicy Indo-Chinese.', 'Hot',20,1,'1 person',1,'plate',5.00,ARRAY['chilly','chicken','chinese','spicy','non-veg'],ARRAY['soy'],true,false,340,460),
  ('Chinese Gravy & Dry','Pepper Chicken','NON_VEG','Chinese',150.00,'Chicken tossed in black pepper and garlic sauce. Bold dry preparation.', 'Hot',20,1,'1 person',1,'plate',5.00,ARRAY['pepper','chicken','chinese','spicy','non-veg'],ARRAY['soy'],false,false,360,490),
  ('Chinese Gravy & Dry','Chicken Masala','NON_VEG','Chinese',140.00,'Chicken in spiced Chinese-style brown gravy with vegetables.', 'Medium',20,1,'1 person',1,'plate',5.00,ARRAY['chicken','masala','chinese','non-veg'],ARRAY['soy'],false,false,350,470),

  -- MEALS / COMBOS
  ('Meals','Chicken Rice + Chicken Manchurian','NON_VEG','Chinese',140.00,'Combo plate: chicken fried rice with chicken Manchurian gravy. Complete Chinese meal.', 'Medium',25,2,'2 - 3 people',1,'combo',5.00,ARRAY['combo','meal','chinese','chicken','non-veg'],ARRAY['soy'],true,true,650,900),
  ('Meals','Chicken Biryani + Chicken 65','NON_VEG','Biryani',150.00,'Chicken biryani served with spicy chicken 65 starter. Value combo meal.', 'Hot',28,2,'2 - 3 people',1,'combo',5.00,ARRAY['combo','meal','biryani','chicken','non-veg','bestseller'],ARRAY[]::text[],true,true,700,980),
  ('Meals','Veg Fried Rice + Gopi Manchurian','VEG','Chinese',120.00,'Veg fried rice with gobi Manchurian. Popular vegetarian combo.', 'Medium',25,2,'2 - 3 people',1,'combo',5.00,ARRAY['combo','meal','chinese','veg'],ARRAY['soy'],false,true,600,780),
  ('Meals','4 Chapati with Paneer Butter Masala','VEG','North Indian',130.00,'Four soft chapatis with rich paneer butter masala gravy. Filling North Indian plate.', 'Mild',22,2,'2 - 3 people',4,'piece',5.00,ARRAY['combo','meal','chapati','paneer','veg'],ARRAY['gluten','dairy'],true,false,550,720),
  ('Meals','4 Chapati with Dhall Fry','VEG','North Indian',100.00,'Four chapatis with homestyle dhall fry. Simple wholesome meal.', 'Medium',20,2,'2 - 3 people',4,'piece',5.00,ARRAY['combo','meal','chapati','dal','veg'],ARRAY['gluten'],false,false,480,620),
  ('Meals','4 Chapati with Kadai Chicken','NON_VEG','North Indian',150.00,'Four chapatis with kadai chicken gravy. Hearty non-veg thali-style combo.', 'Medium',25,2,'2 - 3 people',4,'piece',5.00,ARRAY['combo','meal','chapati','chicken','non-veg'],ARRAY['gluten'],true,true,580,820)
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
  77,
  c.id,
  ('HC77_' || substr(md5('77' || lower(s.item_name)), 1, 16)),
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
FROM _hc77_menu_seed s
CROSS JOIN LATERAL (
  SELECT id
  FROM merchant_menu_categories c
  WHERE c.store_id = 77
    AND lower(trim(c.category_name)) = lower(trim(s.category_name))
  LIMIT 1
) c
WHERE c.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM merchant_menu_items mi
    WHERE mi.store_id = 77
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
FROM _hc77_menu_seed s
WHERE mi.store_id = 77
  AND lower(trim(mi.item_name)) = lower(trim(s.item_name));
