-- Add order status and lifecycle timestamps to orders_food for merchant order management
-- Status lifecycle: NEW -> ACCEPTED -> PREPARING -> READY_FOR_PICKUP -> OUT_FOR_DELIVERY -> DELIVERED
-- Terminal: CANCELLED, REJECTED

ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS order_status text NOT NULL DEFAULT 'NEW',
  ADD COLUMN IF NOT EXISTS accepted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS prepared_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS delivered_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS rejected_reason text;

CREATE INDEX IF NOT EXISTS orders_food_order_status_idx
  ON public.orders_food (order_status)
  WHERE order_status IS NOT NULL;

COMMENT ON COLUMN public.orders_food.order_status IS 'Lifecycle: NEW, ACCEPTED, PREPARING, READY_FOR_PICKUP, OUT_FOR_DELIVERY, DELIVERED, CANCELLED, REJECTED';

-- Enable Supabase Realtime for orders_food (run in Supabase SQL editor if not auto-applied)
-- ALTER PUBLICATION supabase_realtime ADD TABLE orders_food;
