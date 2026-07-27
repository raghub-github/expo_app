-- =============================================================================
-- 0453_customer_lifecycle_notification_templates.sql
-- Food / ride / parcel customer push copy + missing lifecycle templates.
-- Short titles (Zomato-style). Idempotent upserts.
-- =============================================================================

-- ---- Update existing food templates ----
UPDATE public.notification_templates SET
  title_template = '✅ Order Accepted',
  body_template = 'Your order has been accepted by the store and is now being prepared.',
  variables_schema = '{"orderId":"string","orderShortId":"string","merchantName":"string","etaMinutes":"number"}'::jsonb,
  updated_at = now()
WHERE code = 'ORDER_ACCEPTED' AND locale = 'en';

UPDATE public.notification_templates SET
  title_template = '👨‍🍳 Preparing Your Order',
  body_template = 'The store is preparing your order. Estimated delivery: {{etaMinutes}} mins.',
  variables_schema = '{"orderId":"string","orderShortId":"string","merchantName":"string","etaMinutes":"number"}'::jsonb,
  updated_at = now()
WHERE code = 'ORDER_PREPARING' AND locale = 'en';

UPDATE public.notification_templates SET
  title_template = '📦 Order Ready',
  body_template = 'Your order is packed and will be picked up shortly.',
  variables_schema = '{"orderId":"string","orderShortId":"string","merchantName":"string"}'::jsonb,
  updated_at = now()
WHERE code = 'ORDER_FOOD_READY' AND locale = 'en';

UPDATE public.notification_templates SET
  title_template = '📍 Rider Nearby',
  body_template = '{{riderName}} is nearby. Please get ready to receive your order.',
  variables_schema = '{"orderId":"string","orderShortId":"string","riderName":"string","etaMinutes":"number"}'::jsonb,
  updated_at = now()
WHERE code = 'ORDER_RIDER_ARRIVING' AND locale = 'en';

UPDATE public.notification_templates SET
  title_template = '✅ Order Delivered',
  body_template = 'Your order has been delivered successfully. Enjoy your meal! 🍽️',
  variables_schema = '{"orderId":"string","orderShortId":"string","merchantName":"string"}'::jsonb,
  updated_at = now()
WHERE code = 'ORDER_DELIVERED' AND locale = 'en';

UPDATE public.notification_templates SET
  title_template = '🚕 Ride Accepted',
  body_template = '{{captainName}} has accepted your ride and is on the way to pick you up.',
  variables_schema = '{"orderId":"string","orderShortId":"string","captainName":"string","riderId":"string"}'::jsonb,
  updated_at = now()
WHERE code = 'RIDE_CAPTAIN_ON_THE_WAY' AND locale = 'en';

-- ---- New food / ride / parcel templates ----
INSERT INTO public.notification_templates
  (code, category, role, channel, title_template, body_template, deep_link, priority, variables_schema)
VALUES
  ('ORDER_RIDER_AT_STORE',
   'order', 'customer', 'all',
   '🏪 Rider Arrived',
   '{{riderName}} has arrived at the store. Your order is being packed for pickup.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string","riderName":"string","merchantName":"string"}'::jsonb),

  ('ORDER_OUT_FOR_DELIVERY',
   'order', 'customer', 'all',
   '🛵 Order On The Way',
   'Your order is on the way. Keep your phone nearby to receive calls or track your order.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string","riderName":"string","merchantName":"string","etaMinutes":"number"}'::jsonb),

  ('RIDE_RIDER_NEARBY',
   'order', 'customer', 'all',
   '📍 Rider Nearby',
   'Your rider is nearby. Please be ready at the pickup location.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string","captainName":"string"}'::jsonb),

  ('RIDE_RIDER_ARRIVED',
   'order', 'customer', 'all',
   '📍 Rider Has Arrived',
   '{{captainName}} has arrived at your pickup location. Meet your rider to begin your trip.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string","captainName":"string"}'::jsonb),

  ('RIDE_TRIP_STARTED',
   'order', 'customer', 'all',
   '🚗 Trip Started',
   'Your journey has started. Wishing you a safe and pleasant ride.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string","captainName":"string"}'::jsonb),

  ('RIDE_NEAR_DESTINATION',
   'order', 'customer', 'all',
   '📍 Approaching Destination',
   'You''re almost there. Please check your belongings before getting off.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string","captainName":"string"}'::jsonb),

  ('RIDE_COMPLETED',
   'order', 'customer', 'all',
   '✅ Ride Completed',
   'Your trip has been completed successfully. Please rate your rider and share your experience. ⭐',
   '/orders/{{orderId}}', 'normal',
   '{"orderId":"string","orderShortId":"string","captainName":"string"}'::jsonb),

  ('PARCEL_ACCEPTED',
   'order', 'customer', 'all',
   'Parcel Accepted',
   'Your parcel request has been accepted and is being prepared.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string"}'::jsonb),

  ('PARCEL_RIDER_ON_THE_WAY',
   'order', 'customer', 'all',
   'Rider On The Way',
   '{{riderName}} is on the way to collect your parcel.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb),

  ('PARCEL_PICKED_UP',
   'order', 'customer', 'all',
   'Parcel Picked Up',
   'Your parcel has been collected and is on the way.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb),

  ('PARCEL_RIDER_NEARBY',
   'order', 'customer', 'all',
   'Rider Nearby',
   '{{riderName}} is nearby. Please be ready to hand over or receive the parcel.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb),

  ('PARCEL_DELIVERED',
   'order', 'customer', 'all',
   'Parcel Delivered',
   'Your parcel has been delivered successfully.',
   '/orders/{{orderId}}', 'normal',
   '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb)

ON CONFLICT (code, locale) DO UPDATE SET
  title_template = EXCLUDED.title_template,
  body_template = EXCLUDED.body_template,
  deep_link = EXCLUDED.deep_link,
  priority = EXCLUDED.priority,
  variables_schema = EXCLUDED.variables_schema,
  updated_at = now();
