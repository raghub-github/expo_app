-- Snapshot of menu reference verification (images / PDF / sheet) when step 3 is rejected with email.

ALTER TABLE public.store_verification_step_rejections
  ADD COLUMN IF NOT EXISTS step_rejection_detail JSONB NULL;

COMMENT ON COLUMN public.store_verification_step_rejections.step_rejection_detail IS
  'Optional JSON snapshot at rejection time. For step 3: MENU_REFERENCE file/entry statuses (verified vs rejected vs pending).';

ALTER TABLE public.store_verification_step_rejection_history
  ADD COLUMN IF NOT EXISTS step_rejection_detail JSONB NULL;

COMMENT ON COLUMN public.store_verification_step_rejection_history.step_rejection_detail IS
  'Copy of step_rejection_detail for audit when rejection was recorded.';
