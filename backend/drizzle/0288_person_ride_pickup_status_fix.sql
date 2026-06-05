-- Person rides: pickup arrival is RIDER_AT_PICKUP + OTP verified — not food "reached_store" before OTP.
-- Revert in-flight person_ride rows that reached reached_store without OTP verification.
UPDATE public.orders_core oc
SET
  status = 'accepted',
  current_status = COALESCE(NULLIF(TRIM(oc.current_status), ''), 'RIDER_ASSIGNED'),
  updated_at = NOW()
FROM public.orders_ride r
WHERE r.order_id = oc.id
  AND oc.order_type = 'person_ride'
  AND oc.status = 'reached_store'
  AND r.pickup_otp_verified_at IS NULL;

COMMENT ON COLUMN public.orders_core.status IS
  'Coarse lifecycle. Person ride pickup uses current_status RIDER_AT_PICKUP after OTP; avoid reached_store before OTP.';
