-- Fix: orders_food has check constraint orders_food_order_status_check that only allows
-- order_status_type enum values (assigned, accepted, reached_store, ...). core_orders
-- uses current_status = 'PLACED'. Map PLACED → assigned so trigger insert succeeds.

CREATE OR REPLACE FUNCTION push_food_order()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_status TEXT;
BEGIN
  IF NEW.order_type = 'FOOD' THEN
    -- Map app status to orders_food allowed values (order_status_type / check constraint)
    v_order_status := CASE
      WHEN NEW.current_status = 'PLACED' THEN 'assigned'
      ELSE NEW.current_status
    END;

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
      v_order_status,
      now(),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION push_food_order() IS 'After core_orders insert: push to orders_food; maps PLACED→assigned for order_status check.';
