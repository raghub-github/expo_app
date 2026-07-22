-- Rollback 0426 · remove merchant_plans from realtime + drop the read policy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'merchant_plans'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.merchant_plans;
  END IF;
END $$;

DROP POLICY IF EXISTS merchant_plans_public_read ON public.merchant_plans;
