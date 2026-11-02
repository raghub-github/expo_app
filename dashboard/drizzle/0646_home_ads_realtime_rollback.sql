DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'home_ads'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.home_ads;
    END IF;
  END IF;
END $$;

DROP POLICY IF EXISTS home_ads_select_public ON public.home_ads;
