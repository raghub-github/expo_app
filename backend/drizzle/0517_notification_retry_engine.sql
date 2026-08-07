-- Notification retry engine: schedule re-delivery for failed non-terminal pushes.
-- Delays (app-level): 30s, 2m, 5m, 15m via next_retry_at + retry_attempts.

ALTER TABLE public.notification_dispatch_logs
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS notification_dispatch_logs_retry_due_idx
  ON public.notification_dispatch_logs (next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;

INSERT INTO public.notification_settings (key, value, description) VALUES
  ('retry_delays_sec', '[30,120,300,900]'::jsonb, 'Backoff delays between push retries (seconds)'),
  ('reminders_enabled', 'true'::jsonb, 'Enable backend lifecycle reminder poller'),
  ('inactive_user_reminder_days', '14'::jsonb, 'Days of inactivity before reminder push')
ON CONFLICT (key) DO NOTHING;
