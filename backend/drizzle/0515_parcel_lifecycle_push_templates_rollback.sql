-- Rollback 0515_parcel_lifecycle_push_templates.sql
-- Restores parcel templates to 0453 wording (without PARCEL_RIDER_AT_PICKUP / delivery OTP).

BEGIN;

DELETE FROM public.notification_templates
WHERE code = 'PARCEL_RIDER_AT_PICKUP';

UPDATE public.notification_templates SET
  title_template = 'Parcel Accepted',
  body_template = 'Your parcel request has been accepted and is being prepared.',
  variables_schema = '{"orderId":"string","orderShortId":"string"}'::jsonb,
  updated_at = now()
WHERE code = 'PARCEL_ACCEPTED';

UPDATE public.notification_templates SET
  title_template = 'Rider On The Way',
  body_template = '{{riderName}} is on the way to collect your parcel.',
  variables_schema = '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb,
  updated_at = now()
WHERE code = 'PARCEL_RIDER_ON_THE_WAY';

UPDATE public.notification_templates SET
  title_template = 'Parcel Picked Up',
  body_template = 'Your parcel has been collected and is on the way.',
  variables_schema = '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb,
  updated_at = now()
WHERE code = 'PARCEL_PICKED_UP';

UPDATE public.notification_templates SET
  title_template = 'Rider Nearby',
  body_template = '{{riderName}} is nearby. Please be ready to hand over or receive the parcel.',
  variables_schema = '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb,
  updated_at = now()
WHERE code = 'PARCEL_RIDER_NEARBY';

UPDATE public.notification_templates SET
  title_template = 'Parcel Delivered',
  body_template = 'Your parcel has been delivered successfully.',
  variables_schema = '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb,
  updated_at = now()
WHERE code = 'PARCEL_DELIVERED';

COMMIT;
