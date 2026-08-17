-- Rollback 0550_state_rider_online_check.sql

DROP TRIGGER IF EXISTS trg_states_rider_online_check_signal ON public.states;
DROP FUNCTION IF EXISTS public.rider_online_check_bump_signal();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'rider_online_check_signals'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.rider_online_check_signals;
    END IF;
  END IF;
END $$;

DROP POLICY IF EXISTS rider_online_check_signals_public_read ON public.rider_online_check_signals;
REVOKE SELECT ON TABLE public.rider_online_check_signals FROM anon, authenticated;
DROP TABLE IF EXISTS public.rider_online_check_signals;

ALTER TABLE public.states DROP COLUMN IF EXISTS require_rider_online_check;
