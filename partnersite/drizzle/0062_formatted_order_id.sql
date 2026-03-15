-- ============================================================================
-- Formatted Order ID Migration
-- Adds formatted_order_id column with order-type-specific prefixes:
-- Food: GMF100001, Parcel: GMC10001, Ride: GMP10001
-- ============================================================================

-- Add formatted_order_id column to orders_core
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders_core' AND column_name = 'formatted_order_id'
  ) THEN
    ALTER TABLE orders_core ADD COLUMN formatted_order_id TEXT NULL;
  END IF;
END $$;

-- Drop unique constraint if exists (we'll recreate it after backfill)
ALTER TABLE orders_core DROP CONSTRAINT IF EXISTS orders_core_formatted_order_id_key;

-- Create index on formatted_order_id for faster lookups
CREATE INDEX IF NOT EXISTS orders_core_formatted_order_id_idx 
  ON orders_core (formatted_order_id) 
  WHERE formatted_order_id IS NOT NULL;

-- Function to get prefix based on order_type
CREATE OR REPLACE FUNCTION get_order_id_prefix(order_type_val TEXT)
RETURNS TEXT AS $$
BEGIN
  CASE order_type_val
    WHEN 'food' THEN RETURN 'GMF';
    WHEN 'parcel' THEN RETURN 'GMC';
    WHEN 'ride' THEN RETURN 'GMP';
    WHEN '3pl' THEN RETURN 'GM3';
    ELSE RETURN 'GMF'; -- Default to food
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate formatted order ID based on order_type
CREATE OR REPLACE FUNCTION generate_formatted_order_id(order_type_val TEXT)
RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  next_num BIGINT;
  formatted_id TEXT;
BEGIN
  -- Get prefix based on order_type
  prefix := get_order_id_prefix(order_type_val);
  
  -- Get the next sequential number for this order type (start from 10001 for parcel/ride, 100001 for food)
  IF order_type_val = 'food' THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(formatted_order_id FROM 4) AS BIGINT)), 100000) + 1
    INTO next_num
    FROM orders_core
    WHERE formatted_order_id IS NOT NULL 
      AND formatted_order_id ~ ('^' || prefix || '[0-9]+$');
    
    -- Format as prefix + 6-digit number (e.g., GMF100001)
    formatted_id := prefix || LPAD(next_num::TEXT, 6, '0');
  ELSE
    -- For parcel and ride, use 5-digit number (e.g., GMC10001, GMP10001)
    SELECT COALESCE(MAX(CAST(SUBSTRING(formatted_order_id FROM 4) AS BIGINT)), 10000) + 1
    INTO next_num
    FROM orders_core
    WHERE formatted_order_id IS NOT NULL 
      AND formatted_order_id ~ ('^' || prefix || '[0-9]+$');
    
    -- Format as prefix + 5-digit number (e.g., GMC10001, GMP10001)
    formatted_id := prefix || LPAD(next_num::TEXT, 5, '0');
  END IF;
  
  RETURN formatted_id;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-generate formatted_order_id on INSERT
CREATE OR REPLACE FUNCTION set_formatted_order_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set if not already provided
  IF NEW.formatted_order_id IS NULL AND NEW.order_type IS NOT NULL THEN
    NEW.formatted_order_id := generate_formatted_order_id(NEW.order_type::TEXT);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS orders_core_formatted_order_id_trigger ON orders_core;

-- Create trigger to auto-generate formatted_order_id
CREATE TRIGGER orders_core_formatted_order_id_trigger
  BEFORE INSERT ON orders_core
  FOR EACH ROW
  EXECUTE FUNCTION set_formatted_order_id();

-- Backfill existing orders with formatted_order_id based on order_type
DO $$
DECLARE
  rec RECORD;
  food_counter BIGINT := 100001;
  parcel_counter BIGINT := 10001;
  ride_counter BIGINT := 10001;
  prefix TEXT;
  formatted_id TEXT;
BEGIN
  -- Update all existing orders that don't have formatted_order_id
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

-- Add unique constraint after backfill
ALTER TABLE orders_core ADD CONSTRAINT orders_core_formatted_order_id_key UNIQUE (formatted_order_id);

-- Add formatted_order_id to orders_food via trigger (sync from orders_core)
CREATE OR REPLACE FUNCTION sync_formatted_order_id_to_food()
RETURNS TRIGGER AS $$
BEGIN
  -- Update orders_food when orders_core formatted_order_id changes
  UPDATE orders_food
  SET formatted_order_id = NEW.formatted_order_id
  WHERE order_id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to sync formatted_order_id to orders_food
DROP TRIGGER IF EXISTS sync_formatted_order_id_food_trigger ON orders_core;
CREATE TRIGGER sync_formatted_order_id_food_trigger
  AFTER INSERT OR UPDATE OF formatted_order_id ON orders_core
  FOR EACH ROW
  WHEN (NEW.formatted_order_id IS NOT NULL)
  EXECUTE FUNCTION sync_formatted_order_id_to_food();

-- Add formatted_order_id column to orders_food if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders_food' AND column_name = 'formatted_order_id'
  ) THEN
    ALTER TABLE orders_food ADD COLUMN formatted_order_id TEXT NULL;
  END IF;
END $$;

-- Create index on orders_food.formatted_order_id
CREATE INDEX IF NOT EXISTS orders_food_formatted_order_id_idx 
  ON orders_food (formatted_order_id) 
  WHERE formatted_order_id IS NOT NULL;

-- Backfill orders_food with formatted_order_id from orders_core
UPDATE orders_food of
SET formatted_order_id = oc.formatted_order_id
FROM orders_core oc
WHERE of.order_id = oc.id
  AND of.formatted_order_id IS NULL
  AND oc.formatted_order_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN orders_core.formatted_order_id IS 'Human-readable order ID: GMF100001 (food), GMC10001 (parcel), GMP10001 (ride)';
COMMENT ON COLUMN orders_food.formatted_order_id IS 'Synced formatted order ID from orders_core for quick display';
