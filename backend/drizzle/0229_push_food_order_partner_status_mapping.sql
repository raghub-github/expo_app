-- 0229: Fix push_food_order_from_orders_core after 0226 regressed to legacy statuses (assigned, …).
-- Restores partner CHECK values (CREATED, ACCEPTED, …, CANCELLED) so cancel/reject and new orders work.

CREATE OR REPLACE FUNCTION push_food_order_from_orders_core()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_raw TEXT;
  v_order_status TEXT;
  v_item_count INTEGER;
BEGIN
  IF NEW.order_id IS NOT NULL AND NEW.order_type = 'food' THEN
    v_raw := UPPER(COALESCE(NULLIF(TRIM(NEW.current_status), ''), 'PLACED'));

    v_order_status := CASE
      WHEN v_raw IN ('PLACED', 'ORDER_RECEIVED', 'ORDER_PLACED', 'NEW', 'CREATED') THEN 'CREATED'
      WHEN v_raw = 'ACCEPTED' THEN 'ACCEPTED'
      WHEN v_raw = 'PREPARING' THEN 'PREPARING'
      WHEN v_raw = 'READY_FOR_PICKUP' THEN 'READY_FOR_PICKUP'
      WHEN v_raw IN ('OUT_FOR_DELIVERY', 'PICKED_UP', 'IN_TRANSIT', 'ON_THE_WAY') THEN 'OUT_FOR_DELIVERY'
      WHEN v_raw = 'DELIVERED' THEN 'DELIVERED'
      WHEN v_raw IN ('RTO', 'FAILED') THEN 'RTO'
      WHEN v_raw = 'CANCELLED' THEN 'CANCELLED'
      ELSE 'CREATED'
    END;

    SELECT COALESCE(SUM((elem->>'quantity')::int), 0)::int
    INTO v_item_count
    FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb)) elem;

    IF EXISTS (
      SELECT 1 FROM public.orders_food
      WHERE order_id = NEW.id
         OR (NEW.order_id IS NOT NULL AND core_order_id = NEW.order_id)
    ) THEN
      UPDATE public.orders_food SET
        order_id = NEW.id,
        merchant_store_id = NEW.merchant_store_id,
        merchant_parent_id = NEW.merchant_parent_id,
        customer_id = NEW.customer_id,
        food_items_count = COALESCE(NULLIF(v_item_count, 0), food_items_count),
        food_items_total_value = NEW.grand_total,
        items = COALESCE(NEW.items, items),
        delivery_instructions = COALESCE(NEW.checkout_metadata->>'deliveryInstructions', delivery_instructions),
        order_status = CASE
          WHEN UPPER(COALESCE(orders_food.order_status, '')) IN ('CANCELLED', 'DELIVERED', 'RTO')
            AND v_order_status = 'CREATED'
          THEN orders_food.order_status
          ELSE v_order_status
        END,
        formatted_order_id = COALESCE(NEW.formatted_order_id, formatted_order_id),
        updated_at = now()
      WHERE order_id = NEW.id
         OR (NEW.order_id IS NOT NULL AND core_order_id = NEW.order_id);
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
