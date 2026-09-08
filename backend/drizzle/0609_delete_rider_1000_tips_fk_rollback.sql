-- =============================================================================
-- 0609 rollback: restore tips FK RESTRICT (does NOT recreate rider 1000)
-- =============================================================================

BEGIN;

ALTER TABLE public.customer_tips_given
  DROP CONSTRAINT IF EXISTS customer_tips_given_rider_id_fkey;

ALTER TABLE public.customer_tips_given
  ADD CONSTRAINT customer_tips_given_rider_id_fkey
  FOREIGN KEY (rider_id)
  REFERENCES public.riders (id)
  ON DELETE RESTRICT;

COMMIT;
