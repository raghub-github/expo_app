-- Rider dispatch FCM: heads-up copy for killed/background apps.
-- Channel/sound are app-side; this updates the persisted template title/body.

UPDATE public.notification_templates
SET
  title_template = 'New {{serviceLabel}} request',
  body_template = 'A new order is available. Tap to view and accept.',
  deep_link = '/(tabs)/orders',
  priority = 'critical',
  updated_at = NOW()
WHERE code = 'RIDER_DISPATCH_OFFER';
