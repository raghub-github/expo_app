-- Fix: orders_food.order_status check constraint must allow order_status_type enum values
-- so that push_food_order_from_orders_core() can insert 'assigned' (mapped from orders_core PLACED).
-- If the column is TEXT with a restrictive CHECK, drop it and allow enum values.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_food_order_status_check'
  ) THEN
    ALTER TABLE public.orders_food
      DROP CONSTRAINT orders_food_order_status_check;
  END IF;
END $$;

-- Fix existing rows: any order_status not in the allowed list -> 'assigned' (so ADD CONSTRAINT won't fail)
UPDATE public.orders_food
SET order_status = 'assigned'
WHERE order_status IS NOT NULL
  AND order_status NOT IN (
    'assigned', 'accepted', 'reached_store', 'picked_up',
    'in_transit', 'delivered', 'cancelled', 'failed'
  );

-- Allow only valid order_status_type values (and NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_food_order_status_check'
  ) THEN
    ALTER TABLE public.orders_food
      ADD CONSTRAINT orders_food_order_status_check
      CHECK (
        order_status IS NULL
        OR order_status IN (
          'assigned', 'accepted', 'reached_store', 'picked_up',
          'in_transit', 'delivered', 'cancelled', 'failed'
        )
      );
  END IF;
END $$;
