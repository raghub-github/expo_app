-- Rollback 0416_orders_realtime_grants_publication.sql
-- Keeps 0415 policies / REPLICA IDENTITY intact.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'orders_food'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.orders_food;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'orders_core'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.orders_core;
    END IF;
  END IF;
END $$;

REVOKE SELECT ON TABLE public.orders_food FROM authenticated;
REVOKE SELECT ON TABLE public.orders_core FROM authenticated;
