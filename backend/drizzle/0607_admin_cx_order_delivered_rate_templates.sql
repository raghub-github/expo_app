-- Admin Order Details → "Send Cx notification"
-- Post-delivery rating prompts (manual, not auto-lifecycle).
--
-- I/O-safe / idempotent:
--   • Templates: INSERT … ON CONFLICT (code, locale) DO NOTHING
--     (never overwrites title/body/deep_link if an admin already edited them)
--   • Labels: jsonb merge; existing keys win; no-op write if both keys already exist
--   • Does NOT replace admin_cx_template_labels (unlike 0519)

INSERT INTO public.notification_templates (
  code, category, role, channel,
  title_template, body_template, deep_link, priority,
  variables_schema, locale, enabled, retry_count
) VALUES
  (
    'ADMIN_CX_ORDER_DELIVERED_DE', 'order', 'customer', 'all',
    'Order delivered successfully! 💚',
    'Please rate the store and delivery partner. Your feedback helps us serve you better! ⭐',
    '/orders/{{orderId}}?view=history&rate=1', 'normal',
    '{"orderId":"string","orderShortId":"string","merchantName":"string","riderName":"string"}'::jsonb,
    'en', TRUE, 4
  ),
  (
    'ADMIN_CX_ORDER_DELIVERED_SP', 'order', 'customer', 'all',
    'Order delivered successfully! 💚',
    'Please rate the store. Your feedback helps us serve you better! ⭐',
    '/orders/{{orderId}}?view=history&rate=1', 'normal',
    '{"orderId":"string","orderShortId":"string","merchantName":"string"}'::jsonb,
    'en', TRUE, 4
  )
ON CONFLICT (code, locale) DO NOTHING;

INSERT INTO public.notification_settings (key, value, description)
VALUES (
  'admin_cx_template_labels',
  '{
    "ADMIN_CX_ORDER_DELIVERED_DE": "Order Delivered — DE",
    "ADMIN_CX_ORDER_DELIVERED_SP": "Order Delivered — SP"
  }'::jsonb,
  'Dropdown labels for Order Details → Send Cx notification'
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value || COALESCE(notification_settings.value, '{}'::jsonb),
  updated_at = now()
WHERE NOT (
  COALESCE(notification_settings.value, '{}'::jsonb)
    ?& ARRAY['ADMIN_CX_ORDER_DELIVERED_DE', 'ADMIN_CX_ORDER_DELIVERED_SP']
);
