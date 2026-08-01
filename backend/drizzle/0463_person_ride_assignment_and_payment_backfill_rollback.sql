-- Rollback: 0463_person_ride_assignment_and_payment_backfill
-- Removes only rows stamped by this migration (food untouched).

DELETE FROM public.order_rider_assignment_timeline_events te
USING public.order_rider_assignments ora
WHERE te.rider_assignment_id = ora.id
  AND ora.service_type = 'person_ride'
  AND (
    te.metadata->>'source' = '0463_person_ride_assignment_and_payment_backfill'
    OR ora.assignment_metadata->>'source' = '0463_person_ride_assignment_and_payment_backfill'
  );

DELETE FROM public.order_rider_assignments
WHERE service_type = 'person_ride'
  AND assignment_metadata->>'source' = '0463_person_ride_assignment_and_payment_backfill';

DELETE FROM public.orders_core_payments
WHERE gateway_response->>'source' = '0463_person_ride_assignment_and_payment_backfill';
