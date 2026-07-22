-- Rollback 0427 · data backfill cannot be reliably reverted (original NULL breakdown
-- values are gone). No-op. If you must undo, restore from a backup taken before 0427.
SELECT 1;
