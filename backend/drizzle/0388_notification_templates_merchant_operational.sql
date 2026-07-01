-- =============================================================================
-- 0388_notification_templates_merchant_operational.sql
-- Templates for the 4 in-file sendExpoPush sites in merchant-partner.routes.ts
-- (scheduled-off reminder, reopen prompt, waiting-for-order, vacation set).
-- =============================================================================

INSERT INTO public.notification_templates
  (code, category, role, channel, title_template, body_template, deep_link, priority, variables_schema)
VALUES
  ('MERCHANT_SCHEDULED_OFF_REMINDER',
   'operational', 'merchant', 'all',
   'Store closes in 1 hour',
   'Your store will be closed at {{closeTime}} for {{reason}}. Tap to review.',
   '/(tabs)/profile/vacation', 'high',
   '{"closeTime":"string","reason":"string"}'::jsonb),

  ('MERCHANT_REOPEN_PROMPT',
   'operational', 'merchant', 'all',
   'Ready to reopen?',
   'Your scheduled closure ended at {{endTime}}. Tap to bring your store back online.',
   '/(tabs)/profile/status', 'high',
   '{"endTime":"string"}'::jsonb),

  ('MERCHANT_WAITING_FOR_ORDER',
   'operational', 'merchant', 'all',
   'Waiting for your first order',
   'You are online and visible. Notifications for new orders will appear here.',
   '/notifications', 'low',
   '{}'::jsonb),

  ('MERCHANT_SCHEDULED_CLOSURE_SET',
   'operational', 'merchant', 'all',
   'Scheduled closure set',
   'Your store closure has been scheduled from {{startTime}} to {{endTime}}.',
   '/(tabs)/profile/vacation', 'normal',
   '{"startTime":"string","endTime":"string"}'::jsonb)
ON CONFLICT (code, locale) DO NOTHING;
