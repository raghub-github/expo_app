-- Rollback 0491_order_cancelled_refund_notification_templates.sql
DELETE FROM public.notification_templates
WHERE code IN (
  'ORDER_CANCELLED_REFUND_ELIGIBLE',
  'ORDER_CANCELLED_NO_REFUND'
);
