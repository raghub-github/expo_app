-- orders_core columns referenced by order placement / dashboard detail (safe to re-run).
-- 0008 added these on legacy `orders` only; food finalize uses `orders_core`.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_initiator_type') THEN
    CREATE TYPE delivery_initiator_type AS ENUM (
      'customer',
      'merchant',
      'system',
      'agent'
    );
  END IF;
END $$;

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS default_system_kpt_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_initiator delivery_initiator_type DEFAULT 'customer';

COMMENT ON COLUMN public.orders_core.default_system_kpt_minutes IS
  'Store default KPT at placement; also mirrored in billing_snapshot.';
COMMENT ON COLUMN public.orders_core.delivery_initiator IS
  'Who initiated delivery assignment (customer / merchant / system / agent).';
