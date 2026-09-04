-- DOCUMENTATION / CONTRACT EXPORT ONLY — NOT a drizzle migration.
-- DO NOT run this file against production or register it in schema_migrations.
-- Live DB already hosts search_stores_nearby / search_dishes_nearby; replacing
-- them with the simplified bodies below without reconcile would be unsafe.
--
-- Catalog search RPCs used by GET /v1/search (Supabase).
-- Source of truth historically lived only in the hosted Supabase project;
-- this file documents the expected contract for review + local parity.
-- DO NOT apply blindly: reconcile with production before migrating.
--
-- App layer (merchant.service searchUnfiltered) calls:
--   search_stores_nearby(query_text, user_lat, user_lng, lim)
--   search_dishes_nearby(query_text, user_lat, user_lng, lim)
--   search_menu_items(query_text, lim, off)  -- optional; app falls back to ILIKE if absent
--
-- After RPC candidates, the Node service applies:
--   1) store_type early SQL filter where possible
--   2) haversine ≤ min(15km, delivery_radius_km) serviceability
--   3) app-layer re-rank (searchRank.ts)
--   4) offset/limit pagination slice
--
-- Indexes: add ONLY after EXPLAIN on staging proves benefit.
-- Candidate (not applied here — pg_trgm exists in prod but no EXPLAIN need yet;
-- current ILIKE plans are tiny seq scans at present scale):
--   CREATE EXTENSION IF NOT EXISTS pg_trgm;
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS merchant_menu_items_item_name_trgm
--     ON merchant_menu_items USING gin (item_name gin_trgm_ops);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS merchant_stores_display_name_trgm
--     ON merchant_stores USING gin (coalesce(store_display_name, store_name) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- search_menu_items — FTS / ILIKE fallback path (offset honored in RPC)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_menu_items(
  query_text text,
  lim integer DEFAULT 30,
  off integer DEFAULT 0
)
RETURNS SETOF merchant_menu_items
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Prefer FTS when search_vector exists; otherwise ILIKE.
  RETURN QUERY
  SELECT m.*
  FROM merchant_menu_items m
  WHERE m.is_active = true
    AND m.in_stock = true
    AND (
      m.item_name ILIKE '%' || query_text || '%'
      OR coalesce(m.item_description, '') ILIKE '%' || query_text || '%'
      OR coalesce(m.cuisine_type, '') ILIKE '%' || query_text || '%'
    )
  ORDER BY m.item_name ASC
  LIMIT greatest(1, least(coalesce(lim, 30), 50))
  OFFSET greatest(0, coalesce(off, 0));
END;
$$;

-- ---------------------------------------------------------------------------
-- search_stores_nearby — name match within ~15km (haversine in SQL)
-- Returns: id, store_id, store_name, store_display_name, banner_url,
--          cuisine_types, distance_km, search_score
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_stores_nearby(
  query_text text,
  user_lat double precision,
  user_lng double precision,
  lim integer DEFAULT 20
)
RETURNS TABLE (
  id bigint,
  store_id text,
  store_name text,
  store_display_name text,
  banner_url text,
  cuisine_types text[],
  distance_km double precision,
  search_score double precision
)
LANGUAGE sql
STABLE
AS $$
  WITH scored AS (
    SELECT
      s.id,
      s.store_id,
      s.store_name,
      s.store_display_name,
      s.banner_url,
      s.cuisine_types,
      (
        6371 * acos(
          least(1.0, greatest(-1.0,
            cos(radians(user_lat)) * cos(radians(s.latitude::float8))
            * cos(radians(s.longitude::float8) - radians(user_lng))
            + sin(radians(user_lat)) * sin(radians(s.latitude::float8))
          ))
        )
      ) AS distance_km,
      CASE
        WHEN lower(coalesce(s.store_display_name, s.store_name)) = lower(query_text) THEN 100::float8
        WHEN lower(coalesce(s.store_display_name, s.store_name)) LIKE lower(query_text) || '%' THEN 60::float8
        WHEN lower(coalesce(s.store_display_name, s.store_name)) LIKE '%' || lower(query_text) || '%' THEN 30::float8
        ELSE 10::float8
      END AS search_score
    FROM merchant_stores s
    WHERE s.is_active = true
      AND s.has_customer_visible_menu = true
      AND s.latitude IS NOT NULL
      AND s.longitude IS NOT NULL
      AND (
        s.store_name ILIKE '%' || query_text || '%'
        OR coalesce(s.store_display_name, '') ILIKE '%' || query_text || '%'
      )
  )
  SELECT *
  FROM scored
  WHERE distance_km <= 15
  ORDER BY search_score DESC, distance_km ASC
  LIMIT greatest(1, least(coalesce(lim, 20), 50));
$$;

-- ---------------------------------------------------------------------------
-- search_dishes_nearby — item match within ~15km
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_dishes_nearby(
  query_text text,
  user_lat double precision,
  user_lng double precision,
  lim integer DEFAULT 30
)
RETURNS TABLE (
  item_id text,
  item_name text,
  item_description text,
  cuisine_type text,
  selling_price numeric,
  food_type text,
  store_id bigint,
  store_public_id text,
  store_name text,
  distance_km double precision,
  search_score double precision,
  is_popular boolean,
  is_recommended boolean
)
LANGUAGE sql
STABLE
AS $$
  WITH scored AS (
    SELECT
      m.item_id,
      m.item_name,
      m.item_description,
      m.cuisine_type,
      m.selling_price,
      m.food_type,
      s.id AS store_id,
      s.store_id AS store_public_id,
      coalesce(s.store_display_name, s.store_name) AS store_name,
      (
        6371 * acos(
          least(1.0, greatest(-1.0,
            cos(radians(user_lat)) * cos(radians(s.latitude::float8))
            * cos(radians(s.longitude::float8) - radians(user_lng))
            + sin(radians(user_lat)) * sin(radians(s.latitude::float8))
          ))
        )
      ) AS distance_km,
      CASE
        WHEN lower(m.item_name) = lower(query_text) THEN 100::float8
        WHEN lower(m.item_name) LIKE lower(query_text) || '%' THEN 60::float8
        WHEN lower(m.item_name) LIKE '%' || lower(query_text) || '%' THEN 30::float8
        ELSE 10::float8
      END AS search_score,
      coalesce(m.is_popular, false) AS is_popular,
      coalesce(m.is_recommended, false) AS is_recommended
    FROM merchant_menu_items m
    INNER JOIN merchant_stores s ON s.id = m.store_id
    WHERE m.is_active = true
      AND m.in_stock = true
      AND s.is_active = true
      AND s.has_customer_visible_menu = true
      AND s.latitude IS NOT NULL
      AND s.longitude IS NOT NULL
      AND (
        m.item_name ILIKE '%' || query_text || '%'
        OR coalesce(m.cuisine_type, '') ILIKE '%' || query_text || '%'
      )
  )
  SELECT *
  FROM scored
  WHERE distance_km <= 15
  ORDER BY search_score DESC, distance_km ASC
  LIMIT greatest(1, least(coalesce(lim, 30), 50));
$$;
