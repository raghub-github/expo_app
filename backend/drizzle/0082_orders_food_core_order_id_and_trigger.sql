-- Allow orders_food to be fed from core_orders (app flow) or from orders_core (legacy/rider flow).
-- Either order_id (orders_core.id) or core_order_id (core_orders.order_id) must be set.

-- Add column for orders created via core_orders
ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS core_order_id TEXT NULL;

-- Ensure columns used by push_food_order trigger exist (some envs may have minimal schema)
ALTER TABLE public.orders_food ADD COLUMN IF NOT EXISTS customer_id BIGINT NULL;
ALTER TABLE public.orders_food ADD COLUMN IF NOT EXISTS order_status TEXT NULL DEFAULT 'CREATED';

-- Allow order_id to be null when core_order_id is set
ALTER TABLE public.orders_food
  ALTER COLUMN order_id DROP NOT NULL;

-- Unique so one core_order has one orders_food row
CREATE UNIQUE INDEX IF NOT EXISTS orders_food_core_order_id_key
  ON public.orders_food(core_order_id)
  WHERE core_order_id IS NOT NULL;

-- Ensure exactly one source: either orders_core or core_orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_food_source_check'
  ) THEN
    ALTER TABLE public.orders_food
      ADD CONSTRAINT orders_food_source_check
      CHECK (
        (order_id IS NOT NULL AND core_order_id IS NULL)
        OR (order_id IS NULL AND core_order_id IS NOT NULL)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.orders_food.core_order_id IS 'Set when row is created from core_orders (app flow); then order_id is null.';

-- Trigger: after insert on core_orders (order_type = FOOD) → insert into orders_food
CREATE OR REPLACE FUNCTION push_food_order()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_type = 'FOOD' THEN
    INSERT INTO public.orders_food (
      core_order_id,
      merchant_store_id,
      merchant_parent_id,
      customer_id,
      food_items_total_value,
      order_status,
      created_at,
      updated_at
    )
    VALUES (
      NEW.order_id,
      NEW.merchant_store_id,
      NEW.merchant_parent_id,
      NEW.customer_id,
      NEW.grand_total,
      NEW.current_status,
      now(),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_core_order_insert ON public.core_orders;
CREATE TRIGGER after_core_order_insert
  AFTER INSERT ON public.core_orders
  FOR EACH ROW
  EXECUTE FUNCTION push_food_order();
