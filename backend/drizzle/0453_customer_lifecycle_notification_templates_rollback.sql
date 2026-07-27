-- Rollback 0453 — remove newly added templates (updated rows keep latest copy).
DELETE FROM public.notification_templates
WHERE code IN (
  'ORDER_RIDER_AT_STORE',
  'ORDER_OUT_FOR_DELIVERY',
  'RIDE_RIDER_NEARBY',
  'RIDE_RIDER_ARRIVED',
  'RIDE_TRIP_STARTED',
  'RIDE_NEAR_DESTINATION',
  'RIDE_COMPLETED',
  'PARCEL_ACCEPTED',
  'PARCEL_RIDER_ON_THE_WAY',
  'PARCEL_PICKED_UP',
  'PARCEL_RIDER_NEARBY',
  'PARCEL_DELIVERED'
);
