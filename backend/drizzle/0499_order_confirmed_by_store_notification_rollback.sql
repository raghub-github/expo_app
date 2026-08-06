-- Rollback 0499_order_confirmed_by_store_notification.sql

UPDATE public.notification_templates SET
  title_template = '✅ Order Accepted',
  body_template = 'Your order has been accepted by the store and is now being prepared.',
  updated_at = now()
WHERE code = 'ORDER_ACCEPTED' AND locale = 'en';
