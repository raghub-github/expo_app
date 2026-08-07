-- Rollback 0516_customer_otp_radius_notifications.sql

BEGIN;

DELETE FROM public.notification_templates
WHERE code IN ('CUSTOMER_PICKUP_OTP_ARRIVED', 'CUSTOMER_DELIVERY_OTP_NEARBY');

ALTER TABLE public.orders_core
  DROP COLUMN IF EXISTS pickup_otp_radius_notified_at,
  DROP COLUMN IF EXISTS delivery_otp_radius_notified_at;

COMMIT;
