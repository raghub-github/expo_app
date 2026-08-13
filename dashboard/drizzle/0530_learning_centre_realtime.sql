-- Instant Learning Centre updates in apps.
-- Super Admin writes bump a 1-row version counter; merchant app listens via
-- Supabase Realtime (same pattern as prevent_service_signals) and refetches.

CREATE TABLE IF NOT EXISTS public.learning_centre_signals (
  id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version     BIGINT NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.learning_centre_signals (id, version)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.learning_centre_bump_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.learning_centre_signals
  SET version = version + 1,
      updated_at = NOW()
  WHERE id = 1;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_learning_centre_videos_signal ON public.learning_centre_videos;
CREATE TRIGGER trg_learning_centre_videos_signal
  AFTER INSERT OR UPDATE OR DELETE ON public.learning_centre_videos
  FOR EACH ROW EXECUTE FUNCTION public.learning_centre_bump_signal();

ALTER TABLE public.learning_centre_signals REPLICA IDENTITY FULL;
ALTER TABLE public.learning_centre_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_centre_signals_public_read ON public.learning_centre_signals;
CREATE POLICY learning_centre_signals_public_read
  ON public.learning_centre_signals
  FOR SELECT
  USING (true);

DO $$
BEGIN
  GRANT SELECT ON TABLE public.learning_centre_signals TO anon, authenticated;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'learning_centre_signals'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.learning_centre_signals;
    END IF;
  END IF;
END $$;

COMMENT ON TABLE public.learning_centre_signals IS
  'Single-row version counter; bumped on any Learning Centre video change so apps refresh instantly.';
