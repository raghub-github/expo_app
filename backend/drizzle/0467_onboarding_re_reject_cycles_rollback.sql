-- Rollback: 0467_onboarding_re_reject_cycles

BEGIN;

DROP INDEX IF EXISTS public.store_verification_step_rejections_awaiting_fix_idx;
DROP INDEX IF EXISTS public.merchant_store_onboarding_resubmissions_history_idx;

ALTER TABLE public.store_verification_step_rejections
  DROP COLUMN IF EXISTS rejection_round;

-- Keep merchant_store_onboarding_resubmissions.cycle_number (from 0466); do not drop here.

COMMIT;
