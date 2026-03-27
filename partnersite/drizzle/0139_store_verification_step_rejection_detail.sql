-- Mirror of dashboard/drizzle/0143_store_verification_step_rejection_detail.sql (shared DB).

ALTER TABLE public.store_verification_step_rejections
  ADD COLUMN IF NOT EXISTS step_rejection_detail JSONB NULL;

COMMENT ON COLUMN public.store_verification_step_rejections.step_rejection_detail IS
  'Optional JSON snapshot at rejection time. For step 3: MENU_REFERENCE file/entry statuses (verified vs rejected vs pending).';

ALTER TABLE public.store_verification_step_rejection_history
  ADD COLUMN IF NOT EXISTS step_rejection_detail JSONB NULL;

COMMENT ON COLUMN public.store_verification_step_rejection_history.step_rejection_detail IS
  'Copy of step_rejection_detail for audit when rejection was recorded.';
