-- Rollback 0598 rider dispatch offer push copy.

UPDATE public.notification_templates
SET
  title_template = 'New {{serviceLabel}} order',
  body_template = '{{displayId}} · {{pickupDistance}} from pickup — tap to view',
  deep_link = '/(tabs)/orders',
  priority = 'critical',
  updated_at = NOW()
WHERE code = 'RIDER_DISPATCH_OFFER';
