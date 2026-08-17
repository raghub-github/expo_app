-- =============================================================================
-- 0550: State-level "rider online check" (Delivery unavailable gate)
-- =============================================================================
-- Super Admin → Geo & coverage: per-state toggle above Edit location.
-- ON  (default) = checkout blocks when no nearby rider (current behaviour).
-- OFF             = skip the pre-placement rider check for that state.
--
-- I/O: ADD COLUMN … DEFAULT true is metadata-only (PG 11+). No backfill UPDATE.
-- Realtime: single-row signal, bumped only when this column changes.
-- =============================================================================

ALTER TABLE public.states
  ADD COLUMN IF NOT EXISTS require_rider_online_check boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.states.require_rider_online_check IS
  'When true, customer checkout runs the nearby-rider availability gate before place-order. When false, the order may be placed without that restriction.';

CREATE TABLE IF NOT EXISTS public.rider_online_check_signals (
  id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version     BIGINT NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.rider_online_check_signals (id, version)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

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
      updated_at = NOW()
  WHERE id = 1;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_states_rider_online_check_signal ON public.states;
CREATE TRIGGER trg_states_rider_online_check_signal
  AFTER UPDATE OF require_rider_online_check ON public.states
  FOR EACH ROW
  EXECUTE FUNCTION public.rider_online_check_bump_signal();

ALTER TABLE public.rider_online_check_signals REPLICA IDENTITY FULL;
ALTER TABLE public.rider_online_check_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rider_online_check_signals_public_read ON public.rider_online_check_signals;
CREATE POLICY rider_online_check_signals_public_read
  ON public.rider_online_check_signals
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON TABLE public.rider_online_check_signals TO anon, authenticated;

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

COMMENT ON TABLE public.rider_online_check_signals IS
  'Single-row version counter; bumped when states.require_rider_online_check changes so customer apps apply the gate without reload.';

-- Explicit ON for every state (36 rows). Admin turns individual states off from Geo & coverage.
UPDATE public.states
SET require_rider_online_check = true
WHERE require_rider_online_check IS DISTINCT FROM true;
