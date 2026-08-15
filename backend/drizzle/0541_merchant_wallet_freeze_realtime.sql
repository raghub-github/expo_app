-- Instant freeze/unfreeze backup via postgres_changes.
-- Primary path is Supabase Broadcast from Dashboard/backend (no migration required).
-- Only publish merchant_wallet when RLS is already enabled, so balances are not leaked.

ALTER TABLE public.merchant_wallet REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'merchant_wallet'
      AND c.relrowsecurity
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'merchant_wallet'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.merchant_wallet;
    END IF;
  END IF;

  GRANT USAGE ON SCHEMA public TO authenticated;
  GRANT SELECT ON TABLE public.merchant_wallet TO authenticated;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'jwt_store_ids'
  ) THEN
    DROP POLICY IF EXISTS merchant_wallet_merchant_realtime_select ON public.merchant_wallet;
    EXECUTE $policy$
      CREATE POLICY merchant_wallet_merchant_realtime_select
        ON public.merchant_wallet
        FOR SELECT
        TO authenticated
        USING (merchant_store_id = ANY (public.jwt_store_ids()))
    $policy$;
  END IF;
END $$;
