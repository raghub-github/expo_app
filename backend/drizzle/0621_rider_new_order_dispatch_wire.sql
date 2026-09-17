-- =============================================================================
-- 0621_rider_new_order_dispatch_wire.sql
-- Wire RIDER_NEW_ORDER for rider dispatch push (critical / channel=all).
-- Idempotent: INSERT ON CONFLICT DO NOTHING; UPDATE only flags (never title/body/deep_link).
-- =============================================================================

INSERT INTO public.notification_templates
  (code, category, role, channel, title_template, body_template, deep_link, priority, variables_schema, locale, enabled)
VALUES
  (
    'RIDER_NEW_ORDER',
    'order',
    'rider',
    'all',
    'New order — ₹{{payout}}',
    '{{distanceKm}} km · {{merchantName}} → {{dropArea}}',
    '/orders/{{orderId}}',
    'critical',
    '{"orderId":"string","payout":"number","distanceKm":"number","merchantName":"string","dropArea":"string"}'::jsonb,
    'en',
    TRUE
  )
ON CONFLICT (code, locale) DO NOTHING;

-- Ensure delivery flags without rewriting title/body/deep_link content.
UPDATE public.notification_templates
SET
  enabled = TRUE,
  role = 'rider',
  priority = 'critical',
  channel = 'all',
  category = COALESCE(NULLIF(BTRIM(category), ''), 'order'),
  updated_at = NOW()
WHERE code = 'RIDER_NEW_ORDER';
