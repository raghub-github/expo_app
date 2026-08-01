-- Migration: 0467_onboarding_re_reject_cycles
-- Purpose: Allow admin to reject a step again AFTER partner/AM resubmitted
--   but BEFORE Verify again. Resets merchant_resubmitted_at, bumps rejection_round,
--   and keeps multi-cycle resubmit history on merchant_store_onboarding_resubmissions.
-- Safe to re-run.

BEGIN;

-- Track how many times admin rejected this step (reject → resubmit → re-reject …)
ALTER TABLE public.store_verification_step_rejections
  ADD COLUMN IF NOT EXISTS rejection_round INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.store_verification_step_rejections.rejection_round IS
  'Increments each time admin rejects this step (including re-reject of a resubmitted draft without verifying).';

COMMENT ON COLUMN public.store_verification_step_rejections.merchant_resubmitted_at IS
  'Set when partner/AM finalizes a resubmit (admin sees Verify again). Cleared to NULL on every new reject so Fix CTA reopens on partnersite + AM DB.';

-- Ensure staging table supports multi-cycle pending/applied/discarded history
ALTER TABLE public.merchant_store_onboarding_resubmissions
  ADD COLUMN IF NOT EXISTS cycle_number INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.merchant_store_onboarding_resubmissions.cycle_number IS
  'Reject/resubmit round for this field. New reject discards pending; next resubmit starts/keeps cycle.';

CREATE UNIQUE INDEX IF NOT EXISTS merchant_store_onboarding_resubmissions_pending_uniq
  ON public.merchant_store_onboarding_resubmissions (store_id, verification_step, field_key)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS merchant_store_onboarding_resubmissions_history_idx
  ON public.merchant_store_onboarding_resubmissions (store_id, verification_step, field_key, submitted_at DESC);

CREATE INDEX IF NOT EXISTS store_verification_step_rejections_awaiting_fix_idx
  ON public.store_verification_step_rejections (store_id, step_number)
  WHERE merchant_resubmitted_at IS NULL;

COMMIT;
