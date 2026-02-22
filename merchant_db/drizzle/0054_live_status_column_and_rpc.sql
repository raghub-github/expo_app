-- Single source of truth: live_status from view store_live_status (migration 0053). UI reads live_status ONLY.
-- No generated column (expression not immutable in PG). RPC joins store_live_status to return live_status.

-- 1. RPC returns live_status by joining store_live_status view
DROP FUNCTION IF EXISTS public.get_nearby_merchant_stores(double precision, double precision, double precision, integer, boolean);

CREATE FUNCTION public.get_nearby_merchant_stores(
  user_lat double precision,
  user_lng double precision,
  radius_km double precision DEFAULT 15,
  max_limit integer DEFAULT 50,
  veg_mode boolean DEFAULT false
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
  is_available boolean,
  is_accepting_orders boolean,
  operational_status text,
  status text,
  live_status text,
  distance_km double precision,
  display_image text,
  avg_preparation_time_minutes integer
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
    d.is_available,
    d.is_accepting_orders,
    d.operational_status,
    d.status,
    d.live_status,
    d.distance_km,
    d.display_image,
    d.avg_preparation_time_minutes
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
      COALESCE(ms.is_available, false) AS is_available,
      ms.is_accepting_orders,
      (ms.operational_status::text) AS operational_status,
      ms.status::text AS status,
      sls.live_status,
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
      ) AS distance_km,
      COALESCE(
        ms.banner_url,
        (ms.ads_images)[1],
        (ms.gallery_images)[1],
        ms.logo_url
      ) AS display_image,
      COALESCE(ms.avg_preparation_time_minutes, 30)::integer AS avg_preparation_time_minutes
    FROM public.merchant_stores ms
    JOIN public.store_live_status sls ON sls.id = ms.id
    WHERE
      ms.is_active = true
      AND (ms.approval_status::text = 'APPROVED' OR ms.approval_status IS NULL)
      AND ms.latitude IS NOT NULL
      AND ms.longitude IS NOT NULL
      AND ms.latitude BETWEEN -90 AND 90
      AND ms.longitude BETWEEN -180 AND 180
      AND (
        veg_mode = false
        OR ms.is_pure_veg = true
        OR EXISTS (
          SELECT 1
          FROM public.merchant_menu_items m
          WHERE m.store_id = ms.id
            AND m.is_active = true
            AND m.in_stock = true
            AND LOWER(COALESCE(m.food_type, '')) LIKE 'veg%'
        )
      )
  ) d
  WHERE d.distance_km <= LEAST(radius_km, 15)
  ORDER BY d.distance_km ASC
  LIMIT max_limit;
$$;

COMMENT ON FUNCTION public.get_nearby_merchant_stores(double precision, double precision, double precision, integer, boolean) IS
  'Stores within 15km. Returns live_status from DB (single source of truth). UI must read live_status only.';
