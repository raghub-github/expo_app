-- Merchant new-order push copy + deep link to Partner Home → New tab.
-- Idempotent: only updates when values differ (single-row by unique code).
UPDATE public.notification_templates
SET
  title_template = '🔔 New Order Received',
  body_template = 'Order #{{orderShortId}} is waiting for your acceptance.',
  deep_link = '/(tabs)?orderTab=New',
  updated_at = NOW()
WHERE code = 'MERCHANT_NEW_ORDER'
  AND (
    title_template IS DISTINCT FROM '🔔 New Order Received'
    OR body_template IS DISTINCT FROM 'Order #{{orderShortId}} is waiting for your acceptance.'
    OR deep_link IS DISTINCT FROM '/(tabs)?orderTab=New'
  );
