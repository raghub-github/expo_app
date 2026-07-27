-- 0457_rider_onboarding_progress.sql
-- Persist per-step onboarding progress + heal illegal APPROVAL-without-payment.

ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS onboarding_progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_completed_step text NULL,
  ADD COLUMN IF NOT EXISTS next_required_step text NULL,
  ADD COLUMN IF NOT EXISTS onboarding_progress_pct integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.riders.onboarding_progress IS
  'Per-step statuses: aadhaar/face/pan/vehicle/payment/approval';
COMMENT ON COLUMN public.riders.last_completed_step IS
  'Last completed (or skipped) onboarding progress key';
COMMENT ON COLUMN public.riders.next_required_step IS
  'Next mandatory onboarding progress key';
COMMENT ON COLUMN public.riders.onboarding_progress_pct IS
  '0-100 progress derived from onboarding_progress';

-- Heal: APPROVAL without a completed onboarding payment must not stay in approval queue.
-- Prefer PAYMENT when vehicle selection was submitted; otherwise KYC.
UPDATE public.riders r
SET
  onboarding_stage = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.rider_documents d
      WHERE d.rider_id = r.id
        AND d.doc_type = 'onboarding_vehicle_selection'
        AND COALESCE(d.metadata->>'vehicleDocsSubmittedFor', '') <> ''
        AND COALESCE(d.metadata->>'vehicleDocsSubmittedFor', '') =
            COALESCE(d.metadata->>'vehicleChoice', '')
    ) THEN 'PAYMENT'::onboarding_stage
    ELSE 'KYC'::onboarding_stage
  END,
  updated_at = NOW()
WHERE r.deleted_at IS NULL
  AND r.status IS DISTINCT FROM 'ACTIVE'
  AND r.onboarding_stage = 'APPROVAL'
  AND NOT EXISTS (
    SELECT 1
    FROM public.onboarding_payments p
    WHERE p.rider_id = r.id
      AND p.status = 'completed'
  );
