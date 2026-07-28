-- Migration: 0463_person_ride_assignment_and_payment_backfill
-- Purpose:
--   1) Backfill order_rider_assignments + timeline events for person_ride orders
--      that already have a rider but never wrote history (dashboard Rider Activity Log empty).
--   2) Backfill orders_core_payments for paid person_ride fares missing a capture row
--      (refunds/guard look at orders_core_payments like food).
-- Scope: person_ride ONLY — food/parcel rows are not modified.

-- ---------------------------------------------------------------------------
-- 1) Rider assignment history for existing person_ride orders
-- ---------------------------------------------------------------------------

INSERT INTO public.order_rider_assignments (
  order_id,
  order_core_id,
  order_id_text,
  rider_id,
  rider_name,
  rider_mobile,
  assignment_status,
  service_type,
  is_active,
  assignment_sequence,
  assigned_at,
  accepted_at,
  reached_merchant_at,
  picked_up_at,
  delivered_at,
  cancelled_at,
  assignment_metadata,
  created_at,
  updated_at
)
SELECT
  oc.id,
  oc.id,
  COALESCE(NULLIF(TRIM(oc.order_id), ''), CONCAT('CORE-', oc.id)),
  oc.rider_id,
  r.name,
  r.mobile,
  CASE
    WHEN LOWER(COALESCE(oc.status::text, '')) = 'cancelled' THEN 'cancelled'::rider_assignment_status
    WHEN LOWER(COALESCE(oc.status::text, '')) = 'delivered' THEN 'completed'::rider_assignment_status
    ELSE 'accepted'::rider_assignment_status
  END,
  'person_ride',
  CASE
    WHEN LOWER(COALESCE(oc.status::text, '')) = 'cancelled' THEN FALSE
    ELSE TRUE
  END,
  1,
  COALESCE(oride.rider_assigned_at, oc.updated_at, oc.created_at, NOW()),
  COALESCE(oride.rider_assigned_at, oc.updated_at, oc.created_at, NOW()),
  oride.rider_reached_pickup_at,
  CASE
    WHEN LOWER(COALESCE(oc.current_status::text, '')) IN (
      'pickup_otp_verified', 'ride_in_progress', 'delivered'
    )
      OR LOWER(COALESCE(oc.status::text, '')) IN ('picked_up', 'in_transit', 'delivered')
    THEN COALESCE(oc.actual_pickup_time, oride.rider_reached_pickup_at, oc.updated_at)
    ELSE NULL
  END,
  CASE
    WHEN LOWER(COALESCE(oc.status::text, '')) = 'delivered'
      OR LOWER(COALESCE(oc.current_status::text, '')) = 'delivered'
    THEN COALESCE(oc.actual_delivery_time, oc.updated_at)
    ELSE NULL
  END,
  CASE
    WHEN LOWER(COALESCE(oc.status::text, '')) = 'cancelled' THEN oc.updated_at
    ELSE NULL
  END,
  jsonb_build_object(
    'backfill', true,
    'source', '0463_person_ride_assignment_and_payment_backfill',
    'serviceType', 'person_ride'
  ),
  COALESCE(oride.rider_assigned_at, oc.created_at, NOW()),
  NOW()
FROM public.orders_core oc
INNER JOIN public.orders_ride oride ON oride.order_id = oc.id
LEFT JOIN public.riders r ON r.id = oc.rider_id
WHERE oc.order_type::text = 'person_ride'
  AND oc.rider_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.order_rider_assignments ora
    WHERE ora.order_core_id = oc.id
      AND ora.rider_id = oc.rider_id
  );

-- Timeline events from assignment timestamps (idempotent)
INSERT INTO public.order_rider_assignment_timeline_events (
  rider_assignment_id,
  order_core_id,
  order_id_text,
  rider_id,
  event_type,
  occurred_at,
  merchant_distance_km,
  customer_distance_km,
  status_message,
  metadata
)
SELECT
  ora.id,
  COALESCE(ora.order_core_id, ora.order_id),
  COALESCE(ora.order_id_text, oc.order_id, ''),
  ora.rider_id,
  ev.event_type,
  ev.occurred_at,
  ora.distance_to_merchant_km,
  ora.distance_to_customer_km,
  ev.status_message,
  jsonb_build_object(
    'backfill', true,
    'source', '0463_person_ride_assignment_and_payment_backfill'
  )
FROM public.order_rider_assignments ora
INNER JOIN public.orders_core oc
  ON oc.id = COALESCE(ora.order_core_id, ora.order_id)
CROSS JOIN LATERAL (
  VALUES
    ('assigned'::text, ora.assigned_at, 'Rider assigned'),
    ('accepted'::text, ora.accepted_at, 'Rider accepted'),
    ('reached_merchant'::text, ora.reached_merchant_at, 'Rider reached pickup'),
    ('picked_up'::text, ora.picked_up_at, 'Ride started'),
    ('delivered'::text, ora.delivered_at, 'Ride completed'),
    ('cancelled'::text, ora.cancelled_at, 'Assignment cancelled'),
    ('unassigned'::text, ora.unassigned_at, 'Rider unassigned')
) AS ev(event_type, occurred_at, status_message)
WHERE oc.order_type::text = 'person_ride'
  AND ora.service_type = 'person_ride'
  AND ev.occurred_at IS NOT NULL
ON CONFLICT (rider_assignment_id, event_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Payment capture rows for paid person_ride fares (refund SSOT)
-- ---------------------------------------------------------------------------

INSERT INTO public.orders_core_payments (
  order_id,
  payment_gateway,
  payment_method,
  transaction_id,
  amount,
  currency,
  payment_status,
  gateway_response,
  paid_at,
  created_at
)
SELECT
  oc.order_id,
  CASE
    WHEN NULLIF(TRIM(snap.razorpay_payment_id), '') IS NOT NULL THEN 'razorpay'
    WHEN COALESCE(snap.gati_cash_applied, 0) > 0.005 THEN 'gati_cash'
    ELSE 'ride_fare'
  END,
  CASE
    WHEN NULLIF(TRIM(snap.razorpay_payment_id), '') IS NOT NULL THEN 'UPI'
    WHEN COALESCE(snap.gati_cash_applied, 0) > 0.005 THEN 'WALLET'
    ELSE COALESCE(NULLIF(TRIM(snap.payment_method), ''), 'ONLINE')
  END,
  COALESCE(
    NULLIF(TRIM(snap.razorpay_payment_id), ''),
    CONCAT('ride_fare_backfill:', oc.id, ':', snap.id)
  ),
  COALESCE(snap.amount_paid, snap.payable_total, oc.grand_total, 0),
  'INR',
  'PAID',
  jsonb_build_object(
    'source', '0463_person_ride_assignment_and_payment_backfill',
    'person_ride', true,
    'snapshot_id', snap.id,
    'razorpay_payment_id', snap.razorpay_payment_id,
    'razorpay_order_id', snap.razorpay_order_id,
    'gati_cash_applied', snap.gati_cash_applied,
    'amount_paid', snap.amount_paid
  ),
  COALESCE(snap.created_at, oc.updated_at, NOW()),
  NOW()
FROM public.orders_core oc
INNER JOIN LATERAL (
  SELECT s.*
  FROM public.ride_customer_payment_snapshots s
  WHERE s.order_core_id = oc.id
    AND s.snapshot_phase = 'payment_confirmed'
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT 1
) snap ON TRUE
WHERE oc.order_type::text = 'person_ride'
  AND LOWER(COALESCE(oc.payment_status::text, '')) IN ('completed', 'paid')
  AND oc.order_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.orders_core_payments op
    WHERE op.order_id = oc.order_id
      AND UPPER(COALESCE(op.payment_status, '')) IN (
        'PAID', 'CAPTURED', 'SUCCESS', 'COMPLETED'
      )
  );

-- Also cover paid rides that have payment_status completed but no snapshot row
INSERT INTO public.orders_core_payments (
  order_id,
  payment_gateway,
  payment_method,
  transaction_id,
  amount,
  currency,
  payment_status,
  gateway_response,
  paid_at,
  created_at
)
SELECT
  oc.order_id,
  'ride_fare',
  COALESCE(NULLIF(TRIM(oc.payment_method::text), ''), 'ONLINE'),
  CONCAT('ride_fare_core_backfill:', oc.id),
  COALESCE(oc.grand_total, oc.fare_amount, 0),
  'INR',
  'PAID',
  jsonb_build_object(
    'source', '0463_person_ride_assignment_and_payment_backfill',
    'person_ride', true,
    'from', 'orders_core.payment_status'
  ),
  COALESCE(
    NULLIF(oc.billing_snapshot->>'ride_fare_paid_at', '')::timestamptz,
    oc.updated_at,
    NOW()
  ),
  NOW()
FROM public.orders_core oc
WHERE oc.order_type::text = 'person_ride'
  AND LOWER(COALESCE(oc.payment_status::text, '')) IN ('completed', 'paid')
  AND oc.order_id IS NOT NULL
  AND COALESCE(oc.grand_total, oc.fare_amount, 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.orders_core_payments op
    WHERE op.order_id = oc.order_id
      AND UPPER(COALESCE(op.payment_status, '')) IN (
        'PAID', 'CAPTURED', 'SUCCESS', 'COMPLETED'
      )
  );
