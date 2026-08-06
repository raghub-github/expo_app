-- ORDER_ACCEPTED customer push copy — merchant accept confirmation.
-- Idempotent.

UPDATE public.notification_templates SET
  title_template = 'Order Confirmed by the Store',
  body_template = 'Your order has been confirmed by the store and is now being prepared.',
  variables_schema = '{"orderId":"string","orderShortId":"string","merchantName":"string","etaMinutes":"number"}'::jsonb,
  updated_at = now()
WHERE code = 'ORDER_ACCEPTED' AND locale = 'en';

UPDATE public.notification_templates SET
  title_template = 'Order Confirmed by the Store',
  body_template = 'Your order has been confirmed by the store and is now being prepared.',
  updated_at = now()
WHERE code = 'ORDER_ACCEPTED' AND (locale IS NULL OR locale = '');
