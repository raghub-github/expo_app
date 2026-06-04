-- Step 2/2: backfill person_ride statuses (requires 0289 enum value committed first).

-- OTP verified → reached_user
UPDATE public.orders_core oc
SET
  status = 'reached_user',
  current_status = COALESCE(NULLIF(TRIM(oc.current_status), ''), 'RIDER_AT_PICKUP'),
  updated_at = NOW()
FROM public.orders_ride r
WHERE r.order_id = oc.id
  AND oc.order_type = 'person_ride'
  AND r.pickup_otp_verified_at IS NOT NULL
  AND oc.status IN ('accepted', 'reached_store', 'reached_user');

-- OTP not verified → accepted only
UPDATE public.orders_core oc
SET
  status = 'accepted',
  current_status = CASE
    WHEN UPPER(COALESCE(NULLIF(TRIM(oc.current_status), ''), '')) IN ('RIDER_AT_PICKUP', 'REACHED_STORE')
      THEN 'RIDER_ASSIGNED'
    ELSE COALESCE(NULLIF(TRIM(oc.current_status), ''), 'RIDER_ASSIGNED')
  END,
  updated_at = NOW()
FROM public.orders_ride r
WHERE r.order_id = oc.id
  AND oc.order_type = 'person_ride'
  AND r.pickup_otp_verified_at IS NULL
  AND oc.status IN ('reached_store', 'reached_user');
