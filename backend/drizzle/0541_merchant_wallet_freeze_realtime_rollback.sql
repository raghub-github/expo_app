DROP POLICY IF EXISTS merchant_wallet_merchant_realtime_select ON public.merchant_wallet;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'merchant_wallet'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.merchant_wallet;
    END IF;
  END IF;
END $$;
