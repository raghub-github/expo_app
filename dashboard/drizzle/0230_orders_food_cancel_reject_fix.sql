-- 0230: Idempotent fix for cancel/reject on orders_food (partnersite parity).
-- Run in Supabase SQL editor. Safe to re-run.

ALTER TABLE public.orders_food DROP CONSTRAINT IF EXISTS orders_food_order_status_check;

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
