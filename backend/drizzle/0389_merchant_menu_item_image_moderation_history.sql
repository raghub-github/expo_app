-- Per-image moderation history: keep all upload attempts with rejection reasons.
ALTER TABLE merchant_menu_item_images
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderated_by TEXT;

UPDATE merchant_menu_item_images
SET moderation_status = UPPER(TRIM(moderation_status))
WHERE moderation_status IS NOT NULL
  AND LOWER(TRIM(moderation_status)) IN ('pending', 'approved', 'rejected');

UPDATE merchant_menu_item_images
SET moderation_status = 'PENDING'
WHERE moderation_status IS NULL OR TRIM(moderation_status) = '';

-- Backfill primary image moderation from item-level approval where possible.
UPDATE merchant_menu_item_images img
SET moderation_status = 'APPROVED',
    moderated_at = m.approved_at,
    moderated_by = m.approved_by
FROM merchant_menu_items m
WHERE img.menu_item_id = m.id
  AND img.is_primary = true
  AND m.approval_status = 'APPROVED'
  AND (img.moderation_status IS NULL OR img.moderation_status = 'PENDING');

UPDATE merchant_menu_item_images img
SET moderation_status = 'REJECTED',
    rejection_reason = m.rejection_reason,
    moderated_at = COALESCE(m.updated_at, NOW())
FROM merchant_menu_items m
WHERE img.menu_item_id = m.id
  AND img.is_primary = true
  AND m.approval_status = 'REJECTED'
  AND m.rejection_reason IS NOT NULL;
