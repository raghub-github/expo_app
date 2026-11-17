-- 0652_menu_item_image_rejection_reason_io_safe.sql
-- Ensure menu photo rejection reasons are durable and visible to stores.
--
-- Context: Photo reject keeps merchant_menu_items.approval_status as PENDING/APPROVED
-- while merchant_menu_item_images.moderation_status = REJECTED. Stores need a clear
-- reason on both the item and the primary image row.
--
-- I/O-safe / idempotent:
--   • ADD COLUMN IF NOT EXISTS (no rewrite when columns already exist)
--   • COMMENT only (metadata)
--   • Targeted UPDATE ... WHERE only rows that need backfill (no full-table rewrite)
--   • No DROP / ALTER TYPE / NOT NULL / VALIDATE CONSTRAINT
--
-- PRODUCTION: apply only through the authorized migration process.

BEGIN;

ALTER TABLE public.merchant_menu_items
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE public.merchant_menu_item_images
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderated_by TEXT;

COMMENT ON COLUMN public.merchant_menu_items.rejection_reason IS
  'Agent-provided reason when the item photo (or menu entry) is rejected. Shown on Partner Menu and Control Merchant Portal as Image rejected.';

COMMENT ON COLUMN public.merchant_menu_item_images.rejection_reason IS
  'Agent-provided reason for this image moderation rejection. Primary image reason is surfaced to stores.';

-- Copy primary-image rejection reason onto the item when the item reason is empty.
UPDATE public.merchant_menu_items m
SET rejection_reason = img.rejection_reason,
    updated_at = COALESCE(m.updated_at, NOW())
FROM public.merchant_menu_item_images img
WHERE img.menu_item_id = m.id
  AND img.is_primary = TRUE
  AND UPPER(TRIM(COALESCE(img.moderation_status, ''))) = 'REJECTED'
  AND img.rejection_reason IS NOT NULL
  AND TRIM(img.rejection_reason) <> ''
  AND (m.rejection_reason IS NULL OR TRIM(m.rejection_reason) = '');

-- Copy item rejection reason onto primary rejected images missing a reason.
UPDATE public.merchant_menu_item_images img
SET rejection_reason = m.rejection_reason,
    moderated_at = COALESCE(img.moderated_at, m.updated_at, NOW())
FROM public.merchant_menu_items m
WHERE img.menu_item_id = m.id
  AND img.is_primary = TRUE
  AND UPPER(TRIM(COALESCE(img.moderation_status, ''))) = 'REJECTED'
  AND m.rejection_reason IS NOT NULL
  AND TRIM(m.rejection_reason) <> ''
  AND (img.rejection_reason IS NULL OR TRIM(img.rejection_reason) = '');

COMMIT;
