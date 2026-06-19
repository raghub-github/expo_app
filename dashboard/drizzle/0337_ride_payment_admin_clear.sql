-- Admin can release rider from payment-wait while customer fare remains due.
-- Migration: 0337_ride_payment_admin_clear

ALTER TABLE public.orders_ride
  ADD COLUMN IF NOT EXISTS admin_rider_payment_cleared_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.orders_ride.admin_rider_payment_cleared_at IS
  'Admin cleared rider payment hold; rider earnings credited; customer may still owe fare.';
