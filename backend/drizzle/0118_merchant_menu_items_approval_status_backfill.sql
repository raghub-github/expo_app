-- =============================================================================
-- 0118_merchant_menu_items_approval_status_backfill.sql
-- One-time backfill: set approval_status to APPROVED for existing items that
-- have NULL or were created before the approval workflow, so they are treated
-- as "live" and future edits/deletes go through change requests.
-- Safe to run multiple times (only updates where approval_status IS NULL).
-- =============================================================================

UPDATE merchant_menu_items
SET approval_status = 'APPROVED'::merchant_menu_item_approval_status,
    approved_at = COALESCE(approved_at, NOW()),
    approved_by = COALESCE(approved_by, 'migration'),
    updated_at = NOW()
WHERE approval_status IS NULL;
