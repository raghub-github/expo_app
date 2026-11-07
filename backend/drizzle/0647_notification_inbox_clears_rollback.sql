-- Rollback 0647_notification_inbox_clears.sql
-- Safe: drops only the Clear All cutoff table. Does not touch dispatch logs.

BEGIN;

DROP INDEX IF EXISTS public.notification_inbox_clears_cleared_at_idx;
DROP TABLE IF EXISTS public.notification_inbox_clears;

COMMIT;
