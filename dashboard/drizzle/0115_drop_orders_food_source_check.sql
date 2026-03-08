-- ============================================================================
-- Fix: Drop orders_food_source_check constraint that blocks valid inserts/updates.
-- Error was: new row for relation "orders_food" violates check constraint "orders_food_source_check"
-- ============================================================================

ALTER TABLE orders_food
  DROP CONSTRAINT IF EXISTS orders_food_source_check;
