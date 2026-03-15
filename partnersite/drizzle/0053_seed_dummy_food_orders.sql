-- Seed dummy food orders for testing the Food Order Management portal
-- Run after 0051 and 0052. Requires at least one row in merchant_stores.

INSERT INTO public.orders_core (
  order_type,
  order_source,
  pickup_address_raw,
  pickup_lat,
  pickup_lon,
  drop_address_raw,
  drop_lat,
  drop_lon,
  merchant_store_id
)
SELECT
  'food',
  'internal'::order_source_type,
  'Restaurant Kitchen, 123 Main St',
  28.5355,
  77.3910,
  'Customer Address, 456 Oak Ave',
  28.5400,
  77.3950,
  ms.id
FROM (
  SELECT id FROM merchant_stores
  WHERE deleted_at IS NULL
  ORDER BY CASE WHEN store_id = 'GMMC1002' THEN 0 WHEN store_id = 'GMM0001' THEN 1 ELSE 2 END, id
  LIMIT 1
) ms
CROSS JOIN generate_series(1, 5);

-- Link orders_food to the newly created orders (last 5 inserted)
WITH new_orders AS (
  SELECT id, merchant_store_id, row_number() OVER (ORDER BY created_at DESC) AS rn
  FROM orders_core
  ORDER BY created_at DESC
  LIMIT 5
)
INSERT INTO public.orders_food (
  order_id,
  merchant_store_id,
  restaurant_name,
  restaurant_phone,
  preparation_time_minutes,
  food_items_count,
  food_items_total_value,
  requires_utensils,
  is_fragile,
  is_high_value,
  veg_non_veg,
  delivery_instructions,
  order_status
)
SELECT
  no.id,
  no.merchant_store_id,
  'Dummy Restaurant ' || no.rn,
  '+919876543210',
  15 + (no.rn * 7) % 30,
  2 + (no.rn % 3),
  150.00 + (no.rn * 50),
  no.rn = 2,
  no.rn = 4,
  no.rn = 5,
  CASE no.rn WHEN 1 THEN 'veg'::veg_non_veg_type WHEN 2 THEN 'non_veg'::veg_non_veg_type ELSE 'mixed'::veg_non_veg_type END,
  CASE WHEN no.rn IN (2, 4) THEN 'Leave at door' ELSE NULL END,
  (ARRAY['CREATED', 'CREATED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'])[no.rn]
FROM new_orders no;
