-- 0515: Parcel lifecycle push templates — every stage + delivery OTP after pickup.
--
-- Ensures customer parcel notifications work end-to-end:
--   PARCEL_ACCEPTED          → booked / searching captain
--   PARCEL_RIDER_ON_THE_WAY  → captain accepted, heading to pickup
--   PARCEL_RIDER_AT_PICKUP   → captain at pickup (share pickup PIN)
--   PARCEL_PICKED_UP         → pickup OTP verified; show delivery OTP
--   PARCEL_RIDER_NEARBY      → near drop; remind delivery OTP
--   PARCEL_DELIVERED         → delivered
--
-- Idempotent: safe to re-run.

BEGIN;

INSERT INTO public.notification_templates
  (code, category, role, channel, title_template, body_template, deep_link, priority, variables_schema)
VALUES
  ('PARCEL_ACCEPTED',
   'order', 'customer', 'all',
   'Parcel booked',
   'Your parcel request is confirmed. Looking for a nearby captain.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb),

  ('PARCEL_RIDER_ON_THE_WAY',
   'order', 'customer', 'all',
   'Captain on the way to pickup',
   '{{riderName}} is on the way to collect your parcel. Share the pickup PIN when they arrive.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb),

  ('PARCEL_RIDER_AT_PICKUP',
   'order', 'customer', 'all',
   'Captain at pickup',
   '{{riderName}} has reached pickup. Share your pickup PIN to hand over the parcel.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb),

  ('PARCEL_PICKED_UP',
   'order', 'customer', 'all',
   'Parcel picked up',
   'Your parcel is on the way. Delivery OTP is {{deliveryOtp}}. Share it only at drop.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string","riderName":"string","deliveryOtp":"string"}'::jsonb),

  ('PARCEL_RIDER_NEARBY',
   'order', 'customer', 'all',
   'Captain nearby',
   '{{riderName}} is nearby. Your delivery OTP is {{deliveryOtp}}. Share this OTP to confirm delivery.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string","riderName":"string","deliveryOtp":"string"}'::jsonb),

  ('PARCEL_DELIVERED',
   'order', 'customer', 'all',
   'Parcel delivered',
   'Your parcel has been delivered successfully.',
   '/orders/{{orderId}}', 'normal',
   '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb)
ON CONFLICT (code, locale) DO UPDATE SET
  title_template = EXCLUDED.title_template,
  body_template = EXCLUDED.body_template,
  deep_link = EXCLUDED.deep_link,
  priority = EXCLUDED.priority,
  variables_schema = EXCLUDED.variables_schema,
  enabled = TRUE,
  updated_at = now();

COMMIT;
