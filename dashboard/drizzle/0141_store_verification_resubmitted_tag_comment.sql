-- Partner "Resubmitted" tag on store list uses store_verification_step_rejections.merchant_resubmitted_at.
-- Column is created by 0139 / backfilled by 0140; no new objects required.
-- This migration only documents behavior for operators (safe to run on any DB that already has the column).

COMMENT ON COLUMN public.store_verification_step_rejections.merchant_resubmitted_at IS
  'Set when partner saves onboarding for a rejected verification step (register-store-progress PUT). Drives Resubmitted tag and Updates sent UI until team clears rejection.';
