-- Orders food status enum: CREATED (was NEW), Delivered (label for completed), remove REJECTED
-- Lifecycle: CREATED -> ACCEPTED -> PREPARING -> READY_FOR_PICKUP -> OUT_FOR_DELIVERY -> DELIVERED
-- Terminal: RTO, CANCELLED (REJECTED merged into CANCELLED)

-- 1. Migrate existing data: NEW -> CREATED, REJECTED -> CANCELLED
UPDATE public.orders_food SET order_status = 'CREATED' WHERE order_status = 'NEW';
UPDATE public.orders_food SET order_status = 'CANCELLED' WHERE order_status = 'REJECTED';

-- 2. Create enum type for orders_food status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'orders_food_status') THEN
    CREATE TYPE public.orders_food_status AS ENUM (
      'CREATED',
      'ACCEPTED',
      'PREPARING',
      'READY_FOR_PICKUP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'RTO',
      'CANCELLED'
    );
  END IF;
END
$$;

-- 3. Add constraint to validate allowed values (if column stays as text for flexibility)
ALTER TABLE public.orders_food DROP CONSTRAINT IF EXISTS orders_food_order_status_check;
ALTER TABLE public.orders_food ADD CONSTRAINT orders_food_order_status_check
  CHECK (order_status IN (
    'CREATED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP',
    'OUT_FOR_DELIVERY', 'DELIVERED', 'RTO', 'CANCELLED'
  ));

-- 4. Update default to CREATED
ALTER TABLE public.orders_food ALTER COLUMN order_status SET DEFAULT 'CREATED';

-- 5. Update comment
COMMENT ON COLUMN public.orders_food.order_status IS 'Lifecycle: CREATED, ACCEPTED, PREPARING, READY_FOR_PICKUP, OUT_FOR_DELIVERY, DELIVERED. Terminal: RTO, CANCELLED';
