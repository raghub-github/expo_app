-- Rollback MERCHANT_NEW_ORDER copy to prior seed/deeplink defaults.
UPDATE public.notification_templates
SET
  title_template = 'New order #{{orderShortId}}',
  body_template = '{{itemCount}} item(s) · ₹{{amount}} · {{customerName}}',
  deep_link = '/order/{{foodOrderId}}',
  updated_at = NOW()
WHERE code = 'MERCHANT_NEW_ORDER';
