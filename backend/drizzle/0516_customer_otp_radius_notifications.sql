-- 0516: Customer OTP radius push templates + once-only notify stamps.
--
-- Pickup OTP push (once) when rider first enters pickup radius:
--   parcel / person_ride (customer-facing pickup PIN)
-- Drop / delivery OTP push (once) when rider first enters delivery radius:
--   food / parcel
--
-- Also stamps on orders_core for API gating (never expose OTP before radius).
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS pickup_otp_radius_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_otp_radius_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders_core.pickup_otp_radius_notified_at IS
  'First time customer was notified with pickup OTP after rider entered pickup radius.';
COMMENT ON COLUMN public.orders_core.delivery_otp_radius_notified_at IS
  'First time customer was notified with delivery OTP after rider entered drop radius.';

INSERT INTO public.notification_templates
  (code, category, role, channel, title_template, body_template, deep_link, priority, variables_schema)
VALUES
  ('CUSTOMER_PICKUP_OTP_ARRIVED',
   'order', 'customer', 'all',
   'Delivery Partner Has Arrived',
   '{{riderName}} has arrived at the pickup location. Your Pickup OTP is {{pickupOtp}}. Please share this OTP with the captain only when your parcel/order is being picked up.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string","riderName":"string","pickupOtp":"string"}'::jsonb),

  ('CUSTOMER_DELIVERY_OTP_NEARBY',
   'order', 'customer', 'all',
   'Delivery Partner Is Near You',
   '{{riderName}} is near your delivery location. Your Delivery OTP is {{deliveryOtp}}. Please share this OTP with the captain only after receiving your parcel/order.',
   '/orders/{{orderId}}', 'high',
   '{"orderId":"string","orderShortId":"string","riderName":"string","deliveryOtp":"string"}'::jsonb)
ON CONFLICT (code, locale) DO UPDATE SET
  title_template = EXCLUDED.title_template,
  body_template = EXCLUDED.body_template,
  deep_link = EXCLUDED.deep_link,
  priority = EXCLUDED.priority,
  variables_schema = EXCLUDED.variables_schema,
  enabled = TRUE,
  updated_at = now();

-- Stage templates stay OTP-free; dedicated CUSTOMER_* templates carry OTP copy.
UPDATE public.notification_templates SET
  title_template = 'Parcel picked up',
  body_template = 'Your parcel has been collected and is on the way to the drop location.',
  variables_schema = '{"orderId":"string","orderShortId":"string","riderName":"string"}'::jsonb,
  updated_at = now()
WHERE code = 'PARCEL_PICKED_UP';

COMMIT;
