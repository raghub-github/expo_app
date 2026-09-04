-- Notification template for the DL-expiry warning (§20). Idempotent seed.
INSERT INTO notification_templates (code, category, role, channel, title_template, body_template, priority, locale, enabled)
SELECT
  'RIDER_DL_EXPIRING', 'rider', 'rider', 'push',
  'Driving Licence expiring soon',
  'Your Driving Licence expires in {{daysRemaining}} day(s). Update it now from Vehicles & Documents to keep all services available.',
  'high', 'en', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates WHERE code = 'RIDER_DL_EXPIRING' AND locale = 'en'
);
