-- =============================================================================
-- 0482 ROLLBACK: drop revocable-notification support
-- =============================================================================

DROP INDEX IF EXISTS public.notification_dispatch_logs_campaign_revoked_idx;
DROP INDEX IF EXISTS public.notification_dispatch_logs_recipient_active_idx;

ALTER TABLE public.notification_dispatch_logs
  DROP COLUMN IF EXISTS revoked_at;
