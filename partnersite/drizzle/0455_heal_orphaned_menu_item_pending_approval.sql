-- 0455_heal_orphaned_menu_item_pending_approval.sql
-- I/O-safe: single filtered UPDATE; no table rewrite; no concurrent index builds.
--
-- Heal live menu items stuck as approval_status=PENDING when Admin queues are empty:
--   - no PENDING change request for the item
--   - no PENDING primary photo awaiting Image Review
-- These orphans show "Pending Approval" on Partner Menu / Merchant App incorrectly.

BEGIN;

UPDATE merchant_menu_items m
SET
  approval_status = 'APPROVED'::merchant_menu_item_approval_status,
  approved_at = COALESCE(m.approved_at, NOW()),
  approved_by = COALESCE(m.approved_by, 'system:0455_heal_orphaned_pending'),
  rejection_reason = CASE
    WHEN EXISTS (
      SELECT 1
      FROM merchant_menu_item_images img
      WHERE img.menu_item_id = m.id
        AND img.is_primary = TRUE
        AND UPPER(TRIM(COALESCE(img.moderation_status, ''))) = 'REJECTED'
    ) THEN m.rejection_reason
    ELSE NULL
  END,
  updated_at = NOW()
WHERE m.approval_status = 'PENDING'::merchant_menu_item_approval_status
  AND COALESCE(m.is_deleted, FALSE) = FALSE
  AND NOT EXISTS (
    SELECT 1
    FROM merchant_menu_item_review_requests r
    WHERE r.menu_item_id = m.id
      AND r.status = 'PENDING'::merchant_menu_item_review_request_status
  )
  AND NOT EXISTS (
    SELECT 1
    FROM merchant_menu_item_images img
    WHERE img.menu_item_id = m.id
      AND img.is_primary = TRUE
      AND UPPER(TRIM(COALESCE(img.moderation_status, 'PENDING'))) = 'PENDING'
  );

COMMIT;
