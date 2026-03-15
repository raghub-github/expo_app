-- Menu/media file verification state and activity type for uploads.
-- Uploaded CSV/image starts as PENDING; agent verifies and adds items, then marks VERIFIED.

-- Add verification columns to merchant_store_media_files
ALTER TABLE public.merchant_store_media_files
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone NULL,
  ADD COLUMN IF NOT EXISTS verified_by uuid NULL;

-- Constrain verification_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_store_media_files_verification_status_check'
  ) THEN
    ALTER TABLE public.merchant_store_media_files
      ADD CONSTRAINT merchant_store_media_files_verification_status_check
      CHECK (verification_status IN ('PENDING', 'VERIFIED'));
  END IF;
END $$;

COMMENT ON COLUMN public.merchant_store_media_files.verification_status IS 'PENDING until agent verifies and adds items to menu; then VERIFIED.';
COMMENT ON COLUMN public.merchant_store_media_files.verified_at IS 'When an agent marked this file as verified (items added to menu).';
COMMENT ON COLUMN public.merchant_store_media_files.verified_by IS 'Auth user id of agent who verified (optional).';
COMMENT ON COLUMN public.merchant_store_media_files.uploaded_by IS 'Auth user id of merchant/user who uploaded the file.';

-- Add activity type for "menu file uploaded" (for store activity log)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'MENU_FILE_UPLOADED'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'activity_type')
  ) THEN
    ALTER TYPE activity_type ADD VALUE 'MENU_FILE_UPLOADED';
  END IF;
END $$;

-- Index for filtering by verification status
CREATE INDEX IF NOT EXISTS merchant_store_media_files_verification_idx
  ON public.merchant_store_media_files(store_id, verification_status)
  WHERE media_scope = 'MENU_REFERENCE' AND is_active = true AND deleted_at IS NULL;

-- To mark a file as verified (after agent adds items to menu), run:
--   UPDATE merchant_store_media_files
--   SET verification_status = 'VERIFIED', verified_at = now(), verified_by = '<agent_auth_user_uuid>', updated_at = now()
--   WHERE id = <media_file_id>;
