-- 0551 rollback: drop payload columns; restore version-only bump.

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

ALTER TABLE public.rider_online_check_signals
  DROP COLUMN IF EXISTS state_id,
  DROP COLUMN IF EXISTS require_rider_online_check;
