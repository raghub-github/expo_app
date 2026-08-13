DROP TRIGGER IF EXISTS trg_learning_centre_videos_signal ON public.learning_centre_videos;
DROP FUNCTION IF EXISTS public.learning_centre_bump_signal();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'learning_centre_signals'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.learning_centre_signals;
    END IF;
  END IF;
END $$;

DROP POLICY IF EXISTS learning_centre_signals_public_read ON public.learning_centre_signals;
DROP TABLE IF EXISTS public.learning_centre_signals;
