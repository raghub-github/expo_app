-- Nearby merchant stores by user location (Haversine, 15 km default, bounding box for performance).
-- Use from backend via supabase.rpc('get_nearby_merchant_stores', { user_lat, user_lng, radius_km, max_limit }).

CREATE OR REPLACE FUNCTION public.get_nearby_merchant_stores(
  user_lat double precision,
  user_lng double precision,
  radius_km double precision DEFAULT 15,
  max_limit integer DEFAULT 50
)
RETURNS TABLE (
  id bigint,
  store_id text,
  store_name text,
  store_display_name text,
  store_description text,
  full_address text,
  city text,
  latitude numeric,
  longitude numeric,
  logo_url text,
  banner_url text,
  cuisine_types text[],
  is_active boolean,
  is_accepting_orders boolean,
  status text,
  distance_km double precision
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    d.id,
    d.store_id,
    d.store_name,
    d.store_display_name,
    d.store_description,
    d.full_address,
    d.city,
    d.latitude,
    d.longitude,
    d.logo_url,
    d.banner_url,
    d.cuisine_types,
    d.is_active,
    d.is_accepting_orders,
    d.status,
    d.distance_km
  FROM (
    SELECT
      ms.id,
      ms.store_id,
      ms.store_name,
      ms.store_display_name,
      ms.store_description,
      ms.full_address,
      ms.city,
      ms.latitude,
      ms.longitude,
      ms.logo_url,
      ms.banner_url,
      ms.cuisine_types,
      ms.is_active,
      ms.is_accepting_orders,
      ms.status::text AS status,
      (
        6371 * acos(
          greatest(-1, least(1,
            cos(radians(user_lat)) *
            cos(radians(ms.latitude::double precision)) *
            cos(radians(ms.longitude::double precision) - radians(user_lng)) +
            sin(radians(user_lat)) *
            sin(radians(ms.latitude::double precision))
          ))
        )
      ) AS distance_km
    FROM public.merchant_stores ms
    WHERE
      ms.is_active = true
      AND ms.is_accepting_orders = true
      AND ms.latitude IS NOT NULL
      AND ms.longitude IS NOT NULL
      AND ms.latitude BETWEEN (user_lat - 0.2) AND (user_lat + 0.2)
      AND ms.longitude BETWEEN (user_lng - 0.2) AND (user_lng + 0.2)
  ) d
  WHERE d.distance_km <= radius_km
  ORDER BY d.distance_km ASC
  LIMIT max_limit;
$$;

COMMENT ON FUNCTION public.get_nearby_merchant_stores(double precision, double precision, double precision, integer) IS
  'Stores within radius_km of (user_lat, user_lng). Uses bounding box + Haversine. Index-friendly.';
