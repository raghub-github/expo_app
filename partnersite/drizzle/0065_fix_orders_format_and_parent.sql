-- ============================================================================
-- Fix Orders: Update formatted_order_id and merchant_parent_id
-- Run this to fix existing orders (25, 26, 27)
-- ============================================================================

-- Step 1: Update merchant_parent_id from merchant_stores
UPDATE orders_core oc
SET merchant_parent_id = ms.parent_id
FROM merchant_stores ms
WHERE oc.merchant_store_id = ms.id
  AND oc.id IN (25, 26, 27)
  AND (oc.merchant_parent_id IS NULL OR oc.merchant_parent_id != ms.parent_id);

-- Step 2: Update formatted_order_id based on order_type
-- This ensures the format matches: GMF100001 (food), GMC10001 (parcel), GMP10001 (ride)
UPDATE orders_core
SET formatted_order_id = CASE 
  WHEN id = 25 AND order_type = 'food' THEN 'GMF100001'
  WHEN id = 26 AND order_type = 'food' THEN 'GMF100002'
  WHEN id = 27 AND order_type = 'food' THEN 'GMF100003'
  -- Add more cases as needed
  ELSE formatted_order_id
END
WHERE id IN (25, 26, 27);

-- Step 3: Sync formatted_order_id to orders_food
UPDATE orders_food of
SET formatted_order_id = oc.formatted_order_id
FROM orders_core oc
WHERE of.order_id = oc.id
  AND oc.id IN (25, 26, 27)
  AND oc.formatted_order_id IS NOT NULL
  AND (of.formatted_order_id IS NULL OR of.formatted_order_id != oc.formatted_order_id);

-- Verification: Check the results
SELECT 
  id,
  order_type,
  formatted_order_id,
  merchant_store_id,
  merchant_parent_id,
  (SELECT parent_id FROM merchant_stores WHERE id = orders_core.merchant_store_id) as store_parent_id
FROM orders_core
WHERE id IN (25, 26, 27)
ORDER BY id;
