-- Ride home offer carousel: 6 CMS image slots (slot 1 already exists).
-- I/O-safe: one PK UPDATE + 5 INSERT … ON CONFLICT DO NOTHING.
-- No table rewrite, no r2_key backfill — extra slots stay empty until admin upload.

UPDATE public.app_static_assets
SET
  label = 'Ride home banner',
  description = 'Ride home offer carousel — up to 6 images. 1 image shows on all offers; 2+ images split across offers.'
WHERE id = 'customer.ride.banner';

INSERT INTO public.app_static_assets (id, app, section, label, description, sort_order)
VALUES
  ('customer.ride.banner_2', 'customer', 'Ride', 'Ride home banner 2', 'Ride home offer carousel slot 2 of 6', 11),
  ('customer.ride.banner_3', 'customer', 'Ride', 'Ride home banner 3', 'Ride home offer carousel slot 3 of 6', 12),
  ('customer.ride.banner_4', 'customer', 'Ride', 'Ride home banner 4', 'Ride home offer carousel slot 4 of 6', 13),
  ('customer.ride.banner_5', 'customer', 'Ride', 'Ride home banner 5', 'Ride home offer carousel slot 5 of 6', 14),
  ('customer.ride.banner_6', 'customer', 'Ride', 'Ride home banner 6', 'Ride home offer carousel slot 6 of 6', 15)
ON CONFLICT (id) DO NOTHING;
