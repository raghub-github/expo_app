-- Rollback 0415_orders_realtime_rls.sql
DROP POLICY IF EXISTS orders_core_merchant_realtime_select ON public.orders_core;
DROP POLICY IF EXISTS orders_food_merchant_realtime_select ON public.orders_food;
DROP FUNCTION IF EXISTS public.jwt_store_ids();

REVOKE SELECT ON TABLE public.orders_food FROM authenticated;
REVOKE SELECT ON TABLE public.orders_core FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders_food'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.orders_food;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders_core'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.orders_core;
    END IF;
  END IF;
END $$;

-- Note: REPLICA IDENTITY is left as FULL (harmless; revert manually if required):
--   ALTER TABLE public.orders_core REPLICA IDENTITY DEFAULT;
--   ALTER TABLE public.orders_food REPLICA IDENTITY DEFAULT;
