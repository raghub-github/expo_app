-- Rollback 0576 ride home banner extra slots.

DELETE FROM public.app_static_assets
WHERE id IN (
  'customer.ride.banner_2',
  'customer.ride.banner_3',
  'customer.ride.banner_4',
  'customer.ride.banner_5',
  'customer.ride.banner_6'
);

UPDATE public.app_static_assets
SET
  label = 'Ride home banner',
  description = 'Ride home top banner'
WHERE id = 'customer.ride.banner';
