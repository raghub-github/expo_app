-- Rider RC name-mismatch photos go to manual admin review (not auto-verify).
-- Notification templates reuse the existing NotificationService.

SET statement_timeout = '15s';

INSERT INTO public.notification_templates
  (code, category, role, channel, title_template, body_template, deep_link, priority, variables_schema)
VALUES
  ('RIDER_RC_MANUAL_VERIFIED',
   'account', 'rider', 'all',
   'RC verified',
   'Your RC has been verified. You can now continue with onboarding payment.',
   '/(onboarding)/payment', 'high',
   '{"riderId":"string"}'::jsonb),
  ('RIDER_RC_MANUAL_REJECTED',
   'account', 'rider', 'all',
   'RC verification failed',
   'Your RC verification could not be completed. Please upload the required RC document again.',
   '/(onboarding)/dl-rc', 'high',
   '{"riderId":"string"}'::jsonb)
ON CONFLICT (code, locale) DO NOTHING;

RESET statement_timeout;
