-- Allow REJECTED on menu reference files when verification step 3 (menu) is rejected by an agent.

ALTER TABLE public.merchant_store_media_files
  DROP CONSTRAINT IF EXISTS merchant_store_media_files_verification_status_check;

ALTER TABLE public.merchant_store_media_files
  ADD CONSTRAINT merchant_store_media_files_verification_status_check
  CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED'));

COMMENT ON COLUMN public.merchant_store_media_files.verification_status IS
  'PENDING: awaiting review; VERIFIED: agent approved menu step; REJECTED: menu step was rejected and merchant must correct.';

-- Optional one-time backfill (uncomment if partners need tags for rejections that occurred before this migration):
-- UPDATE public.merchant_store_media_files m
-- SET verification_status = 'REJECTED', updated_at = now()
-- FROM public.store_verification_step_rejections r
-- WHERE r.store_id = m.store_id
--   AND r.step_number = 3
--   AND m.media_scope = 'MENU_REFERENCE'
--   AND m.is_active = true
--   AND (m.deleted_at IS NULL);
