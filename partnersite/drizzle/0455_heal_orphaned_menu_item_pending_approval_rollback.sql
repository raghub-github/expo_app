-- 0455_heal_orphaned_menu_item_pending_approval_rollback.sql
-- Best-effort rollback: re-PENDING only rows healed by this migration marker.
-- Safe no-op if approved_by was later overwritten by a real agent approve.

BEGIN;

UPDATE merchant_menu_items
SET
  approval_status = 'PENDING'::merchant_menu_item_approval_status,
  approved_at = NULL,
  approved_by = NULL,
  updated_at = NOW()
WHERE approved_by = 'system:0455_heal_orphaned_pending'
  AND approval_status = 'APPROVED'::merchant_menu_item_approval_status
  AND COALESCE(is_deleted, FALSE) = FALSE;

COMMIT;
