-- Mirror of dashboard/drizzle/0142_merchant_store_media_verification_rejected.sql (shared DB).

ALTER TABLE public.merchant_store_media_files
  DROP CONSTRAINT IF EXISTS merchant_store_media_files_verification_status_check;

ALTER TABLE public.merchant_store_media_files
  ADD CONSTRAINT merchant_store_media_files_verification_status_check
  CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED'));

COMMENT ON COLUMN public.merchant_store_media_files.verification_status IS
  'PENDING: awaiting review; VERIFIED: agent approved menu step; REJECTED: menu step was rejected and merchant must correct.';
