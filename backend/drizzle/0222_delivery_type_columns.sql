-- 0222: Add delivery_type to pending_orders and orders_core.
--
-- WHY:
--   At checkout the customer now picks between 'delivery' (standard courier-
--   fulfilled) and 'self_pickup' (customer collects from store). The billing
--   engine waives the delivery fee when self_pickup is chosen, and the rider
--   dispatch flow needs to know to skip rider assignment for self_pickup orders.
--
-- WHAT:
--   - pending_orders.delivery_type  TEXT NOT NULL DEFAULT 'delivery'
--   - orders_core.delivery_type     TEXT NOT NULL DEFAULT 'delivery'
--   - CHECK constraints to limit values to ('delivery','self_pickup')
--   - Index on orders_core.delivery_type for analytics + merchant filtering

BEGIN;

DO $$
BEGIN
  -- pending_orders.delivery_type
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pending_orders' AND column_name='delivery_type'
  ) THEN
    ALTER TABLE public.pending_orders
      ADD COLUMN delivery_type TEXT NOT NULL DEFAULT 'delivery';
    RAISE NOTICE 'Added pending_orders.delivery_type';
  ELSE
    RAISE NOTICE 'pending_orders.delivery_type already exists; skipping';
  END IF;

  -- orders_core.delivery_type
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='orders_core' AND column_name='delivery_type'
  ) THEN
    ALTER TABLE public.orders_core
      ADD COLUMN delivery_type TEXT NOT NULL DEFAULT 'delivery';
    RAISE NOTICE 'Added orders_core.delivery_type';
  ELSE
    RAISE NOTICE 'orders_core.delivery_type already exists; skipping';
  END IF;

  -- CHECK constraints (idempotent)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pending_orders_delivery_type_check'
  ) THEN
    ALTER TABLE public.pending_orders
      ADD CONSTRAINT pending_orders_delivery_type_check
      CHECK (delivery_type IN ('delivery', 'self_pickup'));
    RAISE NOTICE 'Added CHECK on pending_orders.delivery_type';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_core_delivery_type_check'
  ) THEN
    ALTER TABLE public.orders_core
      ADD CONSTRAINT orders_core_delivery_type_check
      CHECK (delivery_type IN ('delivery', 'self_pickup'));
    RAISE NOTICE 'Added CHECK on orders_core.delivery_type';
  END IF;
END $$;

-- Useful for merchant analytics ("how many self-pickup vs delivery orders?")
CREATE INDEX IF NOT EXISTS orders_core_delivery_type_idx
  ON public.orders_core (delivery_type, placed_at);

COMMIT;
