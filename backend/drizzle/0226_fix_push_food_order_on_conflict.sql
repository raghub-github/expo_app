-- Hotfix: push_food_order_from_orders_core used ON CONFLICT (core_order_id) without a matching
-- unique constraint on some DBs (only a partial unique index exists). Use UPDATE/INSERT instead.

CREATE OR REPLACE FUNCTION push_food_order_from_orders_core()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_status TEXT;
  v_item_count INTEGER;
BEGIN
  IF NEW.order_id IS NOT NULL AND NEW.order_type = 'food' THEN
    v_order_status := COALESCE(NULLIF(TRIM(NEW.current_status), ''), 'PLACED');
    IF v_order_status = 'PLACED' THEN
      v_order_status := 'assigned';
    ELSIF v_order_status NOT IN ('assigned', 'accepted', 'reached_store', 'picked_up', 'in_transit', 'delivered', 'cancelled', 'failed') THEN
      v_order_status := 'assigned';
    END IF;

    SELECT COALESCE(SUM((elem->>'quantity')::int), 0)::int
    INTO v_item_count
    FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb)) elem;

    IF EXISTS (SELECT 1 FROM public.orders_food WHERE core_order_id = NEW.order_id) THEN
      UPDATE public.orders_food SET
        order_id = NEW.id,
        merchant_store_id = NEW.merchant_store_id,
        merchant_parent_id = NEW.merchant_parent_id,
        customer_id = NEW.customer_id,
        food_items_count = COALESCE(NULLIF(v_item_count, 0), food_items_count),
        food_items_total_value = NEW.grand_total,
        items = COALESCE(NEW.items, items),
        delivery_instructions = COALESCE(NEW.checkout_metadata->>'deliveryInstructions', delivery_instructions),
        order_status = v_order_status,
        formatted_order_id = COALESCE(NEW.formatted_order_id, formatted_order_id),
        updated_at = now()
      WHERE core_order_id = NEW.order_id;
    ELSE
      INSERT INTO public.orders_food (
        order_id,
        core_order_id,
        merchant_store_id,
        merchant_parent_id,
        customer_id,
        food_items_count,
        food_items_total_value,
        items,
        delivery_instructions,
        order_status,
        formatted_order_id,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        NEW.order_id,
        NEW.merchant_store_id,
        NEW.merchant_parent_id,
        NEW.customer_id,
        NULLIF(v_item_count, 0),
        NEW.grand_total,
        NEW.items,
        COALESCE(NEW.checkout_metadata->>'deliveryInstructions', NULL),
        v_order_status,
        NEW.formatted_order_id,
        now(),
        now()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
