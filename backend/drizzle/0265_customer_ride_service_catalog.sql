-- Customer ride service catalog — UI metadata; availability filtered by nearby on-duty riders.

CREATE TABLE IF NOT EXISTS public.customer_ride_service_catalog (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  subtitle TEXT,
  base_fare NUMERIC(10, 2) NOT NULL,
  eta_mins INTEGER NOT NULL DEFAULT 3,
  capacity INTEGER,
  tag TEXT,
  image_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  vehicle_types TEXT[] NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE public.customer_ride_service_catalog IS
  'Ride book options shown to customers; filtered live by nearby on-duty rider vehicles.';

INSERT INTO public.customer_ride_service_catalog (
  code, label, subtitle, base_fare, eta_mins, capacity, tag, image_key, sort_order, vehicle_types
) VALUES
  ('bike', 'Bike', 'Quick Bike rides', 19, 2, 1, 'FASTEST', 'bike', 1, ARRAY['bike', 'ev_bike']),
  ('bike-lite', 'Bike Lite', 'Budget bike rides', 15, 3, 1, 'SAVE', 'bike', 2, ARRAY['bike', 'ev_bike', 'cycle']),
  ('auto', 'Auto', 'Hassle-free Auto rides', 35, 6, 3, NULL, 'auto', 3, ARRAY['auto', 'cng_auto', 'ev_auto', 'e_rickshaw']),
  ('cab-economy', 'Cab Economy', 'Affordable cab rides', 55, 7, 4, NULL, 'cab', 4, ARRAY['car', 'taxi', 'ev_car']),
  ('cab-premium', 'Cab Premium', 'Premium comfort rides', 85, 8, 4, NULL, 'cab_premium', 5, ARRAY['car', 'taxi', 'ev_car']),
  ('travel', 'Travel', 'Outstation & travel', 120, 12, 4, NULL, 'travel', 6, ARRAY['car', 'taxi', 'ev_car'])
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  subtitle = EXCLUDED.subtitle,
  base_fare = EXCLUDED.base_fare,
  eta_mins = EXCLUDED.eta_mins,
  capacity = EXCLUDED.capacity,
  tag = EXCLUDED.tag,
  image_key = EXCLUDED.image_key,
  sort_order = EXCLUDED.sort_order,
  vehicle_types = EXCLUDED.vehicle_types,
  is_active = EXCLUDED.is_active;
