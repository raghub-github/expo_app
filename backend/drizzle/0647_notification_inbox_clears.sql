-- 0647_notification_inbox_clears.sql
-- Per-user inbox Clear All cutoff for notification_dispatch_logs.
--
-- End-user Clear All must survive app restart / logout / multi-device sync.
-- Dispatch rows remain as audit logs; inbox queries hide anything queued_at
-- at or before the authenticated user's cleared_at.
--
-- Ownership is keyed by the same recipient_user_id string used on dispatch
-- logs (e.g. usr_{riderId}). One row per user — never a global clear flag.
--
-- BACKWARD COMPATIBLE: additive table only. Existing inbox behaviour is
-- unchanged until a user calls POST /v1/notifications/clear-all.
--
-- PRODUCTION: apply only through the authorized migration process.

BEGIN;

CREATE TABLE IF NOT EXISTS public.notification_inbox_clears (
  user_id    TEXT PRIMARY KEY,
  cleared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notification_inbox_clears IS
  'Per-user Clear All cutoff. Inbox APIs hide notification_dispatch_logs with queued_at <= cleared_at for that user_id only.';

COMMENT ON COLUMN public.notification_inbox_clears.user_id IS
  'Authenticated recipient id (JWT sub / recipient_user_id). Never shared across riders.';

COMMENT ON COLUMN public.notification_inbox_clears.cleared_at IS
  'Server-authoritative timestamp from the last successful Clear All. Notifications queued after this remain visible.';

CREATE INDEX IF NOT EXISTS notification_inbox_clears_cleared_at_idx
  ON public.notification_inbox_clears (cleared_at);

COMMIT;
