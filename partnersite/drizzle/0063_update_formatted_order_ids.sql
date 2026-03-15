-- ============================================================================
-- Update Formatted Order IDs and Merchant Parent IDs
-- Updates existing orders with correct formatted_order_id based on order_type
-- and sets merchant_parent_id from merchant_stores relationship
-- ============================================================================

-- Step 1: Update merchant_parent_id from merchant_stores relationship
UPDATE orders_core oc
SET merchant_parent_id = ms.parent_id
FROM merchant_stores ms
WHERE oc.merchant_store_id = ms.id
  AND oc.merchant_parent_id IS NULL
  AND ms.parent_id IS NOT NULL;

-- Step 2: Update formatted_order_id for existing orders based on order_type
-- This will regenerate formatted IDs correctly based on order_type

-- First, clear existing formatted_order_ids to regenerate them
UPDATE orders_core
SET formatted_order_id = NULL
WHERE formatted_order_id IS NOT NULL;

-- Now regenerate formatted_order_ids based on order_type with proper sequencing
DO $$
DECLARE
  rec RECORD;
  food_counter BIGINT := 100001;
  parcel_counter BIGINT := 10001;
  ride_counter BIGINT := 10001;
  prefix TEXT;
  formatted_id TEXT;
BEGIN
  -- Process orders ordered by id to maintain sequence
  FOR rec IN 
    SELECT id, order_type FROM orders_core 
    WHERE formatted_order_id IS NULL 
    ORDER BY id ASC
  LOOP
    -- Get prefix based on order_type
    prefix := get_order_id_prefix(rec.order_type::TEXT);
    
    -- Generate formatted ID based on order_type
    IF rec.order_type::TEXT = 'food' THEN
      formatted_id := prefix || LPAD(food_counter::TEXT, 6, '0');
      food_counter := food_counter + 1;
    ELSIF rec.order_type::TEXT = 'parcel' THEN
      formatted_id := prefix || LPAD(parcel_counter::TEXT, 5, '0');
      parcel_counter := parcel_counter + 1;
    ELSIF rec.order_type::TEXT = 'ride' THEN
      formatted_id := prefix || LPAD(ride_counter::TEXT, 5, '0');
      ride_counter := ride_counter + 1;
    ELSE
      -- Default to food format for unknown types
      formatted_id := 'GMF' || LPAD(food_counter::TEXT, 6, '0');
      food_counter := food_counter + 1;
    END IF;
    
    UPDATE orders_core
    SET formatted_order_id = formatted_id
    WHERE id = rec.id;
  END LOOP;
END $$;

-- Step 3: Sync formatted_order_id to orders_food
UPDATE orders_food of
SET formatted_order_id = oc.formatted_order_id
FROM orders_core oc
WHERE of.order_id = oc.id
  AND oc.formatted_order_id IS NOT NULL
  AND (of.formatted_order_id IS NULL OR of.formatted_order_id != oc.formatted_order_id);

-- Step 4: Ensure unique constraint exists
DO $$
BEGIN
  -- Drop constraint if exists
  ALTER TABLE orders_core DROP CONSTRAINT IF EXISTS orders_core_formatted_order_id_key;
  
  -- Add unique constraint
  ALTER TABLE orders_core ADD CONSTRAINT orders_core_formatted_order_id_key 
    UNIQUE (formatted_order_id);
EXCEPTION
  WHEN duplicate_table THEN
    NULL; -- Constraint already exists
END $$;

-- Verification query (optional - shows results)
-- SELECT 
--   id,
--   order_type,
--   formatted_order_id,
--   merchant_store_id,
--   merchant_parent_id
-- FROM orders_core
-- ORDER BY id;
