-- 0230: Idempotent fix for cancel/reject on orders_food.
-- Run in Supabase SQL editor. Safe to re-run.
--
-- IMPORTANT: Drop CHECK before normalizing rows — legacy constraints only allow
-- assigned/cancelled (lowercase) and reject updates to CREATED/CANCELLED (uppercase).

-- 1) Drop legacy CHECK first (otherwise UPDATE to partner statuses fails)
ALTER TABLE public.orders_food DROP CONSTRAINT IF EXISTS orders_food_order_status_check;

-- 2) Normalize existing rows to partner uppercase statuses
UPDATE public.orders_food
SET order_status = CASE
  WHEN order_status IS NULL THEN NULL
  WHEN UPPER(order_status) IN (
    'CREATED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP',
    'OUT_FOR_DELIVERY', 'DELIVERED', 'RTO', 'CANCELLED'
  ) THEN UPPER(order_status)
  WHEN LOWER(order_status) IN ('new', 'placed', 'order_received', 'order_placed') THEN 'CREATED'
  WHEN LOWER(order_status) = 'assigned' THEN 'CREATED'
  WHEN LOWER(order_status) = 'accepted' THEN 'ACCEPTED'
  WHEN LOWER(order_status) = 'preparing' THEN 'PREPARING'
  WHEN LOWER(order_status) = 'reached_store' THEN 'READY_FOR_PICKUP'
  WHEN LOWER(order_status) IN ('picked_up', 'in_transit', 'on_the_way') THEN 'OUT_FOR_DELIVERY'
  WHEN LOWER(order_status) = 'delivered' THEN 'DELIVERED'
  WHEN LOWER(order_status) IN ('failed', 'rto') THEN 'RTO'
  WHEN LOWER(order_status) IN ('cancelled', 'rejected') THEN 'CANCELLED'
  ELSE 'CREATED'
END
WHERE order_status IS NOT NULL;

-- 3) Partner-only CHECK (apps PATCH CANCELLED / ACCEPTED uppercase)
ALTER TABLE public.orders_food
  ADD CONSTRAINT orders_food_order_status_check
  CHECK (
    order_status IS NULL
    OR order_status IN (
      'CREATED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP',
      'OUT_FOR_DELIVERY', 'DELIVERED', 'RTO', 'CANCELLED'
    )
  );

ALTER TABLE public.orders_food
  ALTER COLUMN order_status SET DEFAULT 'CREATED';

-- 4) Core → food push: partner statuses only; preserve terminal statuses
CREATE OR REPLACE FUNCTION push_food_order_from_orders_core()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_raw TEXT;
  v_order_status TEXT;
  v_item_count INTEGER;
  v_existing_status TEXT;
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

    SELECT UPPER(COALESCE(order_status, ''))
    INTO v_existing_status
    FROM public.orders_food
    WHERE order_id = NEW.id
       OR core_order_id = NEW.order_id
    LIMIT 1;

    IF v_existing_status IN ('CANCELLED', 'DELIVERED', 'RTO')
       AND v_order_status NOT IN ('CANCELLED', 'DELIVERED', 'RTO') THEN
      v_order_status := v_existing_status;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.orders_food
      WHERE order_id = NEW.id
         OR core_order_id = NEW.order_id
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
        order_status = v_order_status,
        formatted_order_id = COALESCE(NEW.formatted_order_id, formatted_order_id),
        updated_at = now()
      WHERE order_id = NEW.id
         OR core_order_id = NEW.order_id;
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

COMMENT ON FUNCTION push_food_order_from_orders_core() IS
  'After INSERT on orders_core (food): upsert orders_food with partner statuses CREATED…CANCELLED.';
