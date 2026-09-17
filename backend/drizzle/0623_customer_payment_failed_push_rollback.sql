-- Rollback CUSTOMER_PAYMENT_FAILED copy to pre-0623 wording.
UPDATE public.notification_templates
SET
  channel = 'all',
  title_template = 'Payment failed',
  body_template = 'Could not collect ₹{{amount}}. {{reason}}',
  deep_link = '/orders/{{orderId}}',
  priority = 'high',
  variables_schema = '{"orderId":"string","amount":"number","reason":"string"}'::jsonb,
  updated_at = NOW()
WHERE code = 'CUSTOMER_PAYMENT_FAILED'
  AND locale = 'en';
