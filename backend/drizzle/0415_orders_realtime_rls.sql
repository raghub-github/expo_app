-- Enable secure Supabase Realtime for the merchant/partner incoming-order pipeline.
--
-- Problem: public.orders_core and public.orders_food had ROW LEVEL SECURITY ENABLED
-- but ZERO policies. RLS-enabled + no-policy = deny-all for the `anon` and
-- `authenticated` Postgres roles, and Supabase Realtime ENFORCES RLS. Result: no
-- app/browser Supabase client ever received postgres_changes for these tables, so
-- the Merchant App's realtime path was dead and it silently fell back to polling.
--
-- Fix: grant SELECT scoped to the caller's OWNED stores, carried in a backend-minted
-- JWT claim `store_ids` (a JSON array of merchant_stores.id). The backend signs this
-- token with SUPABASE_JWT_SECRET (same secret Supabase verifies), so a merchant can
-- only ever read/subscribe to their own stores' orders. Service-role backend queries
-- bypass RLS and are unaffected. This change is strictly additive (previously all
-- non-service access was fully denied).

ALTER TABLE public.orders_core REPLICA IDENTITY FULL;
ALTER TABLE public.orders_food REPLICA IDENTITY FULL;

-- Helper: the set of store ids the current JWT is authorized for.
CREATE OR REPLACE FUNCTION public.jwt_store_ids()
RETURNS bigint[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT (jsonb_array_elements_text(
        COALESCE(auth.jwt() -> 'store_ids', '[]'::jsonb)
      ))::bigint
    ),
    ARRAY[]::bigint[]
  );
$$;

DROP POLICY IF EXISTS orders_core_merchant_realtime_select ON public.orders_core;
CREATE POLICY orders_core_merchant_realtime_select
  ON public.orders_core
  FOR SELECT
  TO authenticated
  USING (merchant_store_id = ANY (public.jwt_store_ids()));

DROP POLICY IF EXISTS orders_food_merchant_realtime_select ON public.orders_food;
CREATE POLICY orders_food_merchant_realtime_select
  ON public.orders_food
  FOR SELECT
  TO authenticated
  USING (merchant_store_id = ANY (public.jwt_store_ids()));

-- Policies alone are insufficient: role also needs SELECT privilege.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON TABLE public.orders_core TO authenticated;
GRANT SELECT ON TABLE public.orders_food TO authenticated;

-- Realtime only delivers postgres_changes for tables in this publication.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders_core'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.orders_core;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders_food'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.orders_food;
    END IF;
  END IF;
END $$;
