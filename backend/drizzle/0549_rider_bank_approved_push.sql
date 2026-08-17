-- Push template when agent approves rider bank account.
INSERT INTO public.notification_templates (
  code, category, role, channel,
  title_template, body_template, deep_link, priority,
  variables_schema, locale, enabled, retry_count
) VALUES (
  'RIDER_BANK_APPROVED', 'account', 'rider', 'all',
  'Bank account approved',
  'Your payout account is verified. You can withdraw earnings once your balance allows.',
  '/(tabs)/earnings', 'high',
  '{}'::jsonb, 'en', TRUE, 4
)
ON CONFLICT (code, locale) DO NOTHING;
