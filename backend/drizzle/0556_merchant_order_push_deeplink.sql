-- Merchant Partner app routes are /order/[foodId] (numeric orders_food.id), not /orders/{{coreOrderId}}.
-- Covers new / active / preparing / ready / picked-up / completed / RTO / scheduled / cancelled.

UPDATE public.notification_templates
SET
  deep_link = '/order/{{foodOrderId}}',
  variables_schema = COALESCE(variables_schema, '{}'::jsonb) || '{"foodOrderId":"string"}'::jsonb,
  updated_at = NOW()
WHERE role = 'merchant'
  AND (
    deep_link LIKE '/orders/%'
    OR code IN (
      'MERCHANT_NEW_ORDER',
      'MERCHANT_ORDER_CANCELLED',
      'ADMIN_RIDER_WAITING',
      'MERCHANT_RIDER_WAIT_ESCALATION'
    )
  );
