-- Customer push when a merchant replies to a store review.
-- Matches notification_templates v2 (title_template / body_template / channel).
-- Idempotent: ON CONFLICT DO NOTHING — no extra writes on re-run.
INSERT INTO public.notification_templates (
  code, category, role, channel,
  title_template, body_template, deep_link, priority,
  variables_schema, locale, enabled, retry_count
) VALUES (
  'CUSTOMER_STORE_REVIEW_REPLY', 'order', 'customer', 'all',
  '{{storeName}} replied to your review',
  '{{replyPreview}}',
  '/orders/{{orderId}}', 'normal',
  '{"storeName":"string","replyPreview":"string","orderId":"string"}'::jsonb,
  'en', TRUE, 4
)
ON CONFLICT (code, locale) DO NOTHING;
