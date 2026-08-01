-- =============================================================================
-- 0491_order_cancelled_refund_notification_templates.sql
-- Context-aware customer cancel notifications (refund eligible vs none).
-- Idempotent: ON CONFLICT (code, locale) DO UPDATE so copy can be refreshed.
-- =============================================================================

INSERT INTO public.notification_templates
  (code, category, role, channel, title_template, body_template, deep_link, priority, variables_schema, locale)
VALUES
  (
    'ORDER_CANCELLED_REFUND_ELIGIBLE',
    'order',
    'customer',
    'all',
    'Your Order Has Been Cancelled',
    'Your order has been cancelled. Your refund has been initiated and will be credited within 2–3 working days.',
    '/orders/{{orderId}}',
    'high',
    '{"orderId":"string","orderShortId":"string"}'::jsonb,
    'en'
  ),
  (
    'ORDER_CANCELLED_NO_REFUND',
    'order',
    'customer',
    'all',
    'Your Order Has Been Cancelled',
    'Your order has been cancelled successfully. No refund is applicable for this order.',
    '/orders/{{orderId}}',
    'high',
    '{"orderId":"string","orderShortId":"string"}'::jsonb,
    'en'
  )
ON CONFLICT (code, locale) DO UPDATE SET
  title_template = EXCLUDED.title_template,
  body_template = EXCLUDED.body_template,
  deep_link = EXCLUDED.deep_link,
  priority = EXCLUDED.priority,
  variables_schema = EXCLUDED.variables_schema,
  channel = EXCLUDED.channel,
  category = EXCLUDED.category,
  enabled = TRUE,
  updated_at = NOW();
