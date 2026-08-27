-- Travel catalog retired; Auto EV uses the former Travel CMS image slot.
UPDATE public.app_static_assets
SET
  label = 'Auto EV option',
  description = 'Ride option list & grid — EV Auto'
WHERE id = 'customer.ride.travel';

UPDATE public.customer_ride_service_catalog
SET is_active = false
WHERE code = 'travel';

UPDATE public.customer_ride_service_catalog SET sort_order = 1 WHERE code = 'bike';
UPDATE public.customer_ride_service_catalog SET sort_order = 2 WHERE code = 'bike-lite';
UPDATE public.customer_ride_service_catalog SET sort_order = 3 WHERE code = 'auto';
UPDATE public.customer_ride_service_catalog
SET image_key = 'ev_auto', sort_order = 4
WHERE code = 'ev_auto';
UPDATE public.customer_ride_service_catalog SET sort_order = 5 WHERE code = 'cab-economy';
UPDATE public.customer_ride_service_catalog SET sort_order = 6 WHERE code = 'cab-premium';
