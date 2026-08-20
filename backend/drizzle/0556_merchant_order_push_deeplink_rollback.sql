UPDATE public.notification_templates
SET
  deep_link = '/orders/{{orderId}}',
  updated_at = NOW()
WHERE code IN ('MERCHANT_NEW_ORDER', 'MERCHANT_ORDER_CANCELLED')
  AND role = 'merchant';
