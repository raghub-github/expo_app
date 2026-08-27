UPDATE public.customer_ride_service_catalog
SET sort_order = 6, is_active = true
WHERE code = 'travel';

UPDATE public.customer_ride_service_catalog
SET image_key = 'auto', sort_order = 4
WHERE code = 'ev_auto';

UPDATE public.app_static_assets
SET
  label = 'Travel option',
  description = 'Ride option list & grid'
WHERE id = 'customer.ride.travel';
