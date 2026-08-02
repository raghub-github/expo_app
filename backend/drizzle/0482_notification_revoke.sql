-- =============================================================================
-- 0482: Revocable notifications — hide a sent campaign from every inbox
-- =============================================================================
-- Campaign / announcement rows in notification_dispatch_logs are delivery audit
-- records, so there was no way to take back a wrong announcement: it stayed in
-- every recipient's inbox forever and each device had to dismiss it locally.
--
-- Adds a soft-delete marker the inbox honours. Audit history is preserved
-- (row + status + timestamps stay), the row simply stops being served to apps.
-- =============================================================================

ALTER TABLE public.notification_dispatch_logs
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Inbox reads filter on (recipient, revoked_at IS NULL) — keep that cheap.
CREATE INDEX IF NOT EXISTS notification_dispatch_logs_recipient_active_idx
  ON public.notification_dispatch_logs (recipient_user_id, queued_at DESC)
  WHERE revoked_at IS NULL;

-- Revoking works campaign-wide.
CREATE INDEX IF NOT EXISTS notification_dispatch_logs_campaign_revoked_idx
  ON public.notification_dispatch_logs (campaign_id)
  WHERE revoked_at IS NULL;

COMMENT ON COLUMN public.notification_dispatch_logs.revoked_at IS
  'Set by super-admin revoke. Row is kept for audit but is no longer returned by /v1/notifications/inbox.';
