-- Complete merchant incoming-order realtime plumbing (follows 0415).
--
-- 0415 added RLS policies + REPLICA IDENTITY, but Realtime still needs:
--   1) GRANT SELECT to the `authenticated` role (policies alone are not enough)
--   2) tables listed in the `supabase_realtime` publication
-- Without both, postgres_changes never reach the Merchant App / Partner Site,
-- so the incoming-order sheet only opens via slow polling (or never, if the
-- food-orders list path also fails).

-- Privileges required for RLS policies targeting TO authenticated.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON TABLE public.orders_core TO authenticated;
GRANT SELECT ON TABLE public.orders_food TO authenticated;

-- Ensure auth.jwt() helper exists (Supabase usually provides this; no-op safe).
-- jwt_store_ids() from 0415 depends on auth.jwt().

-- Add tables to Realtime publication if the publication exists and they are absent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'orders_core'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.orders_core;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'orders_food'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.orders_food;
    END IF;
  END IF;
END $$;
