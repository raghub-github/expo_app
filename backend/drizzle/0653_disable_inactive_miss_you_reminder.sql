-- Stop daily ~07:00 IST "We miss you" blasts from CUSTOMER_INACTIVE_REMINDER.
-- Quiet hours skip marketing overnight; the 1m poller then succeeds at 07:00.
-- Keep wallet / subscription / abandoned-cart reminders on reminders_enabled.

INSERT INTO public.notification_settings (key, value, description)
VALUES (
  'inactive_user_reminder_enabled',
  'false'::jsonb,
  'When true, reminder poller may send CUSTOMER_INACTIVE_REMINDER (We miss you). Default false — was causing daily 7AM marketing blasts after quiet hours.'
)
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();

UPDATE public.notification_templates
SET enabled = FALSE,
    updated_at = now()
WHERE code = 'CUSTOMER_INACTIVE_REMINDER'
  AND locale = 'en';
