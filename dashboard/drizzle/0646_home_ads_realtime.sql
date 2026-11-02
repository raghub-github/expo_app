-- Home Ads: realtime so partner/customer/rider apps show/hide ads instantly
-- when Super Admin creates, updates, enables, or disables a card.

DO $$
BEGIN
  GRANT SELECT ON TABLE public.home_ads TO anon, authenticated;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE IF EXISTS public.home_ads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'home_ads' AND policyname = 'home_ads_select_public'
  ) THEN
    CREATE POLICY home_ads_select_public
      ON public.home_ads
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'home_ads'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.home_ads;
    END IF;
  END IF;
END $$;

COMMENT ON TABLE public.home_ads IS
  'Promo ad cards; supabase_realtime + SELECT RLS so apps refresh on admin create/enable/disable.';
