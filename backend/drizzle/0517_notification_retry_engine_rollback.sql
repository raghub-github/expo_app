DROP INDEX IF EXISTS public.notification_dispatch_logs_retry_due_idx;
ALTER TABLE public.notification_dispatch_logs DROP COLUMN IF EXISTS next_retry_at;
DELETE FROM public.notification_settings
WHERE key IN ('retry_delays_sec', 'reminders_enabled', 'inactive_user_reminder_days');
