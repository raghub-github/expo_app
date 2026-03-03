-- Fix: order_type enum is 'food'; order_status in orders_food must be one of assigned/accepted/... (not PLACED). Map PLACED -> assigned.
CREATE OR REPLACE FUNCTION push_food_order_from_orders_core()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_status TEXT;
BEGIN
  IF NEW.order_id IS NOT NULL AND NEW.order_type = 'food' THEN
    v_order_status := COALESCE(NULLIF(TRIM(NEW.current_status), ''), 'PLACED');
    IF v_order_status = 'PLACED' THEN
      v_order_status := 'assigned';
    ELSIF v_order_status NOT IN ('assigned', 'accepted', 'reached_store', 'picked_up', 'in_transit', 'delivered', 'cancelled', 'failed') THEN
      v_order_status := 'assigned';
    END IF;
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

COMMENT ON FUNCTION push_food_order_from_orders_core() IS 'After insert on orders_core with order_id and order_type=food: push row to orders_food. Maps PLACED to assigned for order_status CHECK.';
