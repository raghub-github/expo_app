INSERT INTO public.notification_templates (
  code, category, role, channel,
  title_template, body_template, deep_link, priority,
  variables_schema, locale, enabled, retry_count
) VALUES
  (
    'MERCHANT_STORE_DELISTED', 'operational', 'merchant', 'all',
    'Store Delisted',
    '{{storeName}} has been delisted from GatiMitra and cannot receive new orders. Reason: {{reason}}',
    '/(tabs)', 'high',
    '{"storeName":"string","reason":"string"}'::jsonb, 'en', TRUE, 4
  ),
  (
    'MERCHANT_STORE_RELISTED', 'operational', 'merchant', 'all',
    'Store Relisted',
    '{{storeName}} has been relisted. You can turn the store online from Store Status.',
    '/(tabs)', 'high',
    '{"storeName":"string"}'::jsonb, 'en', TRUE, 4
  )
ON CONFLICT (code, locale) DO NOTHING;
