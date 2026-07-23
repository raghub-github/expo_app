-- Rollback 0431 · The reconcile reflects reality (payment was refunded → the
-- subscription must be revoked). Re-activating a refunded subscription would be
-- incorrect, so this is a no-op. Restore from a backup if you truly must revert.
SELECT 1;
