-- Rider push when merchant marks food ready for pickup.
INSERT INTO public.notification_templates
  (code, category, role, channel, title_template, body_template, deep_link, priority, variables_schema, locale, enabled)
SELECT
  'RIDER_FOOD_READY',
  'order',
  'rider',
  'all',
  'Order ready for pickup',
  '{{merchantName}} marked order #{{orderShortId}} ready. Collect ASAP.',
  '/(tabs)/orders',
  'high',
  '{"orderId":"string","orderShortId":"string","merchantName":"string"}'::jsonb,
  'en',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates WHERE code = 'RIDER_FOOD_READY' AND locale = 'en'
);
