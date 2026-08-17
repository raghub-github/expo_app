-- =============================================================================
-- 0551: Rider-online-check signal carries state id + current flag
-- =============================================================================
-- Customer checkout closes "No rider available" instantly when Super Admin
-- turns the state toggle OFF, and re-applies the gate when it turns ON.
-- =============================================================================

ALTER TABLE public.rider_online_check_signals
  ADD COLUMN IF NOT EXISTS state_id uuid,
  ADD COLUMN IF NOT EXISTS require_rider_online_check boolean;

CREATE OR REPLACE FUNCTION public.rider_online_check_bump_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.require_rider_online_check IS NOT DISTINCT FROM OLD.require_rider_online_check THEN
    RETURN NULL;
  END IF;
  UPDATE public.rider_online_check_signals
  SET version = version + 1,
      updated_at = NOW(),
      state_id = NEW.id,
      require_rider_online_check = NEW.require_rider_online_check
  WHERE id = 1;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_states_rider_online_check_signal ON public.states;
CREATE TRIGGER trg_states_rider_online_check_signal
  AFTER UPDATE OF require_rider_online_check ON public.states
  FOR EACH ROW
  EXECUTE FUNCTION public.rider_online_check_bump_signal();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'rider_online_check_signals'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.rider_online_check_signals;
    END IF;
  END IF;
END $$;
