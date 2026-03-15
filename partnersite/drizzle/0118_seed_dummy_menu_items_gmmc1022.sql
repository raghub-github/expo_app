-- Seed dummy menu items for store GMMC1022 (internal id = 50) to test Free Plan limit (15 items).
-- Run this after 0117_subscription_plan_locking.sql.
-- Then call: SELECT enforce_plan_limits(50); or POST /api/merchant/subscription/enforce-limits with storeId=50
-- Expected: 15 items stay unlocked, 7 become is_locked_by_plan = TRUE.

-- Ensure one category for store 50, then insert 22 dummy items (exceeds Free Plan 15-item limit).
DO $$
DECLARE
  v_cat_id BIGINT;
BEGIN
  SELECT id INTO v_cat_id FROM public.merchant_menu_categories WHERE store_id = 50 AND is_active = TRUE ORDER BY id LIMIT 1;
  IF v_cat_id IS NULL THEN
    INSERT INTO public.merchant_menu_categories (store_id, category_name, is_active)
    VALUES (50, 'Dummy Test Category', TRUE)
    RETURNING id INTO v_cat_id;
  END IF;

  -- Insert 22 dummy menu items (exceeds Free Plan limit of 15)
  INSERT INTO public.merchant_menu_items (
    store_id,
    category_id,
    item_id,
    item_name,
    item_description,
    base_price,
    selling_price,
    preparation_time_minutes,
    is_active,
    in_stock
  )
  VALUES
    (50, v_cat_id, 'GMMC1022_DUMMY_01', 'Dummy Burger 1', 'Test item for plan limit', 99.00, 99.00, 15, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_02', 'Dummy Burger 2', 'Test item for plan limit', 99.00, 99.00, 15, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_03', 'Dummy Biryani 1', 'Test item for plan limit', 149.00, 149.00, 20, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_04', 'Dummy Biryani 2', 'Test item for plan limit', 149.00, 149.00, 20, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_05', 'Dummy Mithai 1', 'Test item for plan limit', 79.00, 79.00, 10, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_06', 'Dummy Mithai 2', 'Test item for plan limit', 79.00, 79.00, 10, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_07', 'Dummy Fries', 'Test item for plan limit', 49.00, 49.00, 5, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_08', 'Dummy Cold Drink', 'Test item for plan limit', 39.00, 39.00, 2, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_09', 'Dummy Wrap', 'Test item for plan limit', 89.00, 89.00, 12, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_10', 'Dummy Pasta', 'Test item for plan limit', 129.00, 129.00, 15, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_11', 'Dummy Pizza Slice', 'Test item for plan limit', 69.00, 69.00, 10, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_12', 'Dummy Salad', 'Test item for plan limit', 99.00, 99.00, 8, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_13', 'Dummy Soup', 'Test item for plan limit', 59.00, 59.00, 5, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_14', 'Dummy Dessert 1', 'Test item for plan limit', 89.00, 89.00, 5, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_15', 'Dummy Dessert 2', 'Test item for plan limit', 89.00, 89.00, 5, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_16', 'Dummy Extra 1 (over limit)', 'Test item for plan limit', 49.00, 49.00, 5, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_17', 'Dummy Extra 2 (over limit)', 'Test item for plan limit', 49.00, 49.00, 5, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_18', 'Dummy Extra 3 (over limit)', 'Test item for plan limit', 49.00, 49.00, 5, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_19', 'Dummy Extra 4 (over limit)', 'Test item for plan limit', 49.00, 49.00, 5, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_20', 'Dummy Extra 5 (over limit)', 'Test item for plan limit', 49.00, 49.00, 5, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_21', 'Dummy Extra 6 (over limit)', 'Test item for plan limit', 49.00, 49.00, 5, TRUE, TRUE),
    (50, v_cat_id, 'GMMC1022_DUMMY_22', 'Dummy Extra 7 (over limit)', 'Test item for plan limit', 49.00, 49.00, 5, TRUE, TRUE)
  ON CONFLICT (item_id) DO NOTHING;
END $$;
