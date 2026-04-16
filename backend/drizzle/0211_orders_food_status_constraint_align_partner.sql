-- ============================================================================
-- 0211_orders_food_status_constraint_align_partner
-- Align orders_food.order_status constraint + core->food trigger mapping to partner statuses:
-- CREATED | ACCEPTED | PREPARING | READY_FOR_PICKUP | OUT_FOR_DELIVERY | DELIVERED | RTO | CANCELLED
--
-- Fixes: new row for relation "orders_food" violates check constraint "orders_food_order_status_check"
-- caused by inserts like 'assigned' from push_food_order_from_orders_core().
-- ============================================================================

-- 1) Normalize existing rows to partner statuses (idempotent)
UPDATE public.orders_food
SET order_status = CASE
  WHEN order_status IS NULL THEN NULL
  WHEN UPPER(order_status) IN ('CREATED','ACCEPTED','PREPARING','READY_FOR_PICKUP','OUT_FOR_DELIVERY','DELIVERED','RTO','CANCELLED') THEN UPPER(order_status)
  WHEN LOWER(order_status) = 'new' THEN 'CREATED'
  WHEN LOWER(order_status) = 'assigned' THEN 'CREATED'
  WHEN LOWER(order_status) = 'accepted' THEN 'ACCEPTED'
  WHEN LOWER(order_status) = 'preparing' THEN 'PREPARING'
  WHEN LOWER(order_status) = 'reached_store' THEN 'READY_FOR_PICKUP'
  WHEN LOWER(order_status) IN ('picked_up','in_transit') THEN 'OUT_FOR_DELIVERY'
  WHEN LOWER(order_status) = 'delivered' THEN 'DELIVERED'
  WHEN LOWER(order_status) = 'failed' THEN 'RTO'
  WHEN LOWER(order_status) = 'cancelled' THEN 'CANCELLED'
  ELSE 'CREATED'
END
WHERE order_status IS NOT NULL;

-- 2) Recreate CHECK constraint to only allow partner statuses
ALTER TABLE public.orders_food DROP CONSTRAINT IF EXISTS orders_food_order_status_check;
ALTER TABLE public.orders_food
  ADD CONSTRAINT orders_food_order_status_check
  CHECK (
    order_status IN (
      'CREATED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP',
      'OUT_FOR_DELIVERY', 'DELIVERED', 'RTO', 'CANCELLED'
    )
  );

-- 3) Ensure default is CREATED (safe if column exists)
ALTER TABLE public.orders_food
  ALTER COLUMN order_status SET DEFAULT 'CREATED';

-- 4) Replace trigger function to insert partner status values (no 'assigned')
CREATE OR REPLACE FUNCTION push_food_order_from_orders_core()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_raw TEXT;
  v_order_status TEXT;
BEGIN
  IF NEW.order_id IS NOT NULL AND NEW.order_type = 'food' THEN
    v_raw := COALESCE(NULLIF(TRIM(NEW.current_status), ''), 'PLACED');
    v_raw := UPPER(v_raw);

    v_order_status := CASE
      WHEN v_raw IN ('PLACED','ORDER_RECEIVED','ORDER_PLACED','NEW','CREATED') THEN 'CREATED'
      WHEN v_raw = 'ACCEPTED' THEN 'ACCEPTED'
      WHEN v_raw = 'PREPARING' THEN 'PREPARING'
      WHEN v_raw = 'READY_FOR_PICKUP' THEN 'READY_FOR_PICKUP'
      WHEN v_raw IN ('OUT_FOR_DELIVERY','PICKED_UP','IN_TRANSIT','ON_THE_WAY') THEN 'OUT_FOR_DELIVERY'
      WHEN v_raw = 'DELIVERED' THEN 'DELIVERED'
      WHEN v_raw IN ('RTO','FAILED') THEN 'RTO'
      WHEN v_raw = 'CANCELLED' THEN 'CANCELLED'
      ELSE 'CREATED'
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

