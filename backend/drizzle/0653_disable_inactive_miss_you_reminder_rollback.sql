DELETE FROM public.notification_settings
WHERE key = 'inactive_user_reminder_enabled';

UPDATE public.notification_templates
SET enabled = TRUE,
    updated_at = now()
WHERE code = 'CUSTOMER_INACTIVE_REMINDER'
  AND locale = 'en';
