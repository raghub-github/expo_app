-- Include temporarily closed stores in customer nearby listing.
-- is_active reflects live online triple (open/closed), not whether the store is listed in the area.
-- Customer app shows CLOSED cards; "not serving here" is only when zero ACTIVE stores exist in radius.

DROP FUNCTION IF EXISTS public.get_nearby_merchant_stores(double precision, double precision, double precision, integer, boolean);

CREATE OR REPLACE FUNCTION public.get_nearby_merchant_stores(
  user_lat double precision,
  user_lng double precision,
  radius_km double precision DEFAULT 15,
  max_limit integer DEFAULT 20,
  veg_mode boolean DEFAULT false
)
RETURNS TABLE (
  id bigint,
  store_id text,
  store_name text,
  store_display_name text,
  store_description text,
  full_address text,
  postal_code text,
  banner_url text,
  gallery_images text[],
  cuisine_types text[],
  city text,
  latitude double precision,
  longitude double precision,
  operational_status text,
  avg_preparation_time_minutes integer,
  is_active boolean,
  is_available boolean,
  is_accepting_orders boolean,
  status text,
  parent_id bigint,
  distance_km double precision,
  display_image text
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      ms.id,
      ms.store_id,
      ms.store_name,
      ms.store_display_name,
      ms.store_description,
      ms.full_address,
      ms.postal_code,
      ms.banner_url,
      ms.gallery_images,
      ms.cuisine_types,
      ms.city,
      ms.latitude::double precision AS lat,
      ms.longitude::double precision AS lng,
      ms.operational_status::text AS operational_status,
      ms.avg_preparation_time_minutes,
      ms.is_active,
      ms.is_available,
      ms.is_accepting_orders,
      ms.status::text AS status,
      ms.parent_id,
      (
        6371.0 * acos(
          LEAST(
            1.0::double precision,
            GREATEST(
              -1.0::double precision,
              cos(radians(user_lat)) * cos(radians(ms.latitude::double precision))
              * cos(radians(ms.longitude::double precision) - radians(user_lng))
              + sin(radians(user_lat)) * sin(radians(ms.latitude::double precision))
            )
          )
        )
      )::double precision AS d_km
    FROM public.merchant_stores ms
    WHERE ms.status::text = 'ACTIVE'
      AND ms.latitude IS NOT NULL
      AND ms.longitude IS NOT NULL
      AND (
        NOT COALESCE(veg_mode, false)
        OR ms.is_pure_veg IS TRUE
        OR EXISTS (
          SELECT 1
          FROM public.merchant_menu_items mmi
          WHERE mmi.store_id = ms.id
            AND mmi.is_active IS TRUE
            AND mmi.in_stock IS TRUE
            AND mmi.approval_status::text = 'APPROVED'
            AND COALESCE(lower(trim(mmi.food_type::text)), '') LIKE 'veg%'
        )
      )
  )
  SELECT
    b.id,
    b.store_id,
    b.store_name,
    b.store_display_name,
    b.store_description,
    b.full_address,
    b.postal_code,
    b.banner_url,
    b.gallery_images,
    b.cuisine_types,
    b.city,
    b.lat AS latitude,
    b.lng AS longitude,
    b.operational_status,
    b.avg_preparation_time_minutes,
    b.is_active,
    b.is_available,
    b.is_accepting_orders,
    b.status,
    b.parent_id,
    round(b.d_km::numeric, 2)::double precision AS distance_km,
    b.banner_url AS display_image
  FROM base b
  WHERE b.d_km <= radius_km
  ORDER BY b.d_km ASC
  LIMIT GREATEST(1, LEAST(max_limit, 50));
$$;

COMMENT ON FUNCTION public.get_nearby_merchant_stores(double precision, double precision, double precision, integer, boolean) IS
  'Nearby ACTIVE merchant_stores by haversine (km). Includes closed stores (is_active=false); live status derived in API.';

GRANT EXECUTE ON FUNCTION public.get_nearby_merchant_stores(double precision, double precision, double precision, integer, boolean)
  TO anon, authenticated, service_role;
