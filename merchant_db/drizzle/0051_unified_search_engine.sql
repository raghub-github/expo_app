-- Unified real-time search engine: pg_trgm, store search_vector, scored search within 15km.
-- Requirements: results only from stores with distance <= 15km, is_active, is_accepting_orders, approval_status = 'APPROVED'.
-- Scoring: exact +100, prefix +80, partial/fuzzy +50, FTS +40. Order: score DESC, distance ASC.

-- 1. Extensions (pg_trgm for similarity; unaccent optional)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Store search vector (merchant_menu_items already has search_vector from 0045)
ALTER TABLE public.merchant_stores
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION public.merchant_stores_search_vector_fn()
RETURNS trigger LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple',
    coalesce(NEW.store_name, '') || ' ' ||
    coalesce(NEW.store_display_name, '') || ' ' ||
    coalesce(array_to_string(NEW.cuisine_types, ' '), '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_stores_search_vector_trigger ON public.merchant_stores;
CREATE TRIGGER merchant_stores_search_vector_trigger
  BEFORE INSERT OR UPDATE OF store_name, store_display_name, cuisine_types
  ON public.merchant_stores
  FOR EACH ROW EXECUTE PROCEDURE public.merchant_stores_search_vector_fn();

UPDATE public.merchant_stores
SET search_vector = to_tsvector('simple',
  coalesce(store_name, '') || ' ' ||
  coalesce(store_display_name, '') || ' ' ||
  coalesce(array_to_string(cuisine_types, ' '), '')
)
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_merchant_stores_search_vector
  ON public.merchant_stores USING GIN (search_vector);

-- 3. Scored store search within 15km (approval_status, is_active, is_accepting_orders)
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
  logo_url text,
  banner_url text,
  cuisine_types text[],
  distance_km double precision,
  search_score double precision
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH q AS (SELECT lower(trim(coalesce(query_text, ''))) AS q),
  nearby AS (
    SELECT
      ms.id,
      ms.store_id,
      ms.store_name,
      ms.store_display_name,
      ms.logo_url,
      ms.banner_url,
      ms.cuisine_types,
      ms.search_vector,
      (
        6371 * acos(greatest(-1, least(1,
          cos(radians(user_lat)) * cos(radians(ms.latitude::double precision)) *
          cos(radians(ms.longitude::double precision) - radians(user_lng)) +
          sin(radians(user_lat)) * sin(radians(ms.latitude::double precision))
        )))
      ) AS distance_km
    FROM public.merchant_stores ms
    WHERE
      ms.is_active = true
      AND ms.is_accepting_orders = true
      AND (ms.approval_status::text = 'APPROVED' OR ms.approval_status IS NULL)
      AND ms.latitude IS NOT NULL
      AND ms.longitude IS NOT NULL
      AND ms.latitude BETWEEN (user_lat - 0.2) AND (user_lat + 0.2)
      AND ms.longitude BETWEEN (user_lng - 0.2) AND (user_lng + 0.2)
  ),
  with_dist AS (
    SELECT * FROM nearby WHERE distance_km <= 15
  ),
  scored AS (
    SELECT
      w.id,
      w.store_id,
      w.store_name,
      w.store_display_name,
      w.logo_url,
      w.banner_url,
      w.cuisine_types,
      w.distance_km,
      (
        (CASE WHEN (SELECT q FROM q) = '' THEN 0
          WHEN lower(w.store_name) = (SELECT q FROM q) THEN 100
          WHEN lower(coalesce(w.store_display_name, '')) = (SELECT q FROM q) THEN 100
          WHEN lower(w.store_name) LIKE (SELECT q FROM q) || '%' THEN 80
          WHEN lower(coalesce(w.store_display_name, '')) LIKE (SELECT q FROM q) || '%' THEN 80
          WHEN lower(w.store_name) LIKE '%' || (SELECT q FROM q) || '%' THEN 60
          WHEN lower(coalesce(w.store_display_name, '')) LIKE '%' || (SELECT q FROM q) || '%' THEN 60
          ELSE 0 END)
        + (CASE WHEN (SELECT q FROM q) <> '' AND w.search_vector IS NOT NULL AND w.search_vector @@ plainto_tsquery('simple', (SELECT q FROM q))
            THEN 40 * ts_rank_cd(w.search_vector, plainto_tsquery('simple', (SELECT q FROM q))) ELSE 0 END)
        + (CASE WHEN (SELECT q FROM q) <> '' THEN least(50, greatest(0, (
            coalesce(similarity(w.store_name, (SELECT q FROM q)), 0) +
            coalesce(similarity(coalesce(w.store_display_name, ''), (SELECT q FROM q)), 0)
          ) * 25)) ELSE 0 END)
      )::double precision AS search_score
    FROM with_dist w
    WHERE (SELECT q FROM q) = ''
       OR lower(w.store_name) LIKE '%' || (SELECT q FROM q) || '%'
       OR lower(coalesce(w.store_display_name, '')) LIKE '%' || (SELECT q FROM q) || '%'
       OR (w.search_vector IS NOT NULL AND w.search_vector @@ plainto_tsquery('simple', (SELECT q FROM q)))
       OR (SELECT q FROM q) <> '' AND (similarity(w.store_name, (SELECT q FROM q)) > 0.2 OR similarity(coalesce(w.store_display_name, ''), (SELECT q FROM q)) > 0.2)
       OR EXISTS (
         SELECT 1 FROM unnest(coalesce(w.cuisine_types, ARRAY[]::text[])) ct
         WHERE lower(ct) LIKE '%' || (SELECT q FROM q) || '%'
       )
  )
  SELECT
    scored.id,
    scored.store_id,
    scored.store_name,
    scored.store_display_name,
    scored.logo_url,
    scored.banner_url,
    scored.cuisine_types,
    scored.distance_km,
    scored.search_score
  FROM scored
  ORDER BY scored.search_score DESC, scored.distance_km ASC
  LIMIT lim;
$$;

COMMENT ON FUNCTION public.search_stores_nearby(text, double precision, double precision, integer) IS
  'Stores within 15km matching query. Score: exact 100, prefix 80, partial 60, FTS+trigram. approval_status=APPROVED.';

-- 4. Scored dish search (menu items from stores within 15km only)
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
SET search_path = public
AS $$
  WITH q AS (SELECT lower(trim(coalesce(query_text, ''))) AS q),
  nearby_stores AS (
    SELECT
      ms.id,
      ms.store_id AS store_public_id,
      ms.store_name,
      (
        6371 * acos(greatest(-1, least(1,
          cos(radians(user_lat)) * cos(radians(ms.latitude::double precision)) *
          cos(radians(ms.longitude::double precision) - radians(user_lng)) +
          sin(radians(user_lat)) * sin(radians(ms.latitude::double precision))
        )))
      ) AS distance_km
    FROM public.merchant_stores ms
    WHERE
      ms.is_active = true
      AND ms.is_accepting_orders = true
      AND (ms.approval_status::text = 'APPROVED' OR ms.approval_status IS NULL)
      AND ms.latitude IS NOT NULL
      AND ms.longitude IS NOT NULL
      AND ms.latitude BETWEEN (user_lat - 0.2) AND (user_lat + 0.2)
      AND ms.longitude BETWEEN (user_lng - 0.2) AND (user_lng + 0.2)
  ),
  within_15 AS (SELECT * FROM nearby_stores WHERE distance_km <= 15),
  scored_items AS (
    SELECT
      m.item_id,
      m.item_name,
      m.item_description,
      m.cuisine_type,
      m.selling_price,
      m.food_type,
      m.store_id,
      s.store_public_id,
      s.store_name,
      s.distance_km,
      (
        (CASE WHEN (SELECT q FROM q) = '' THEN 0
          WHEN lower(m.item_name) = (SELECT q FROM q) THEN 95
          WHEN lower(m.item_name) LIKE (SELECT q FROM q) || '%' THEN 80
          WHEN lower(m.item_name) LIKE '%' || (SELECT q FROM q) || '%' THEN 60
          WHEN lower(coalesce(m.item_description, '')) LIKE '%' || (SELECT q FROM q) || '%' THEN 50
          WHEN lower(coalesce(m.cuisine_type, '')) LIKE '%' || (SELECT q FROM q) || '%' THEN 40
          ELSE 0 END)
        + (CASE WHEN m.search_vector IS NOT NULL AND (SELECT q FROM q) <> '' AND m.search_vector @@ plainto_tsquery('simple', (SELECT q FROM q))
            THEN 40 * ts_rank_cd(m.search_vector, plainto_tsquery('simple', (SELECT q FROM q))) ELSE 0 END)
        + (CASE WHEN (SELECT q FROM q) <> '' THEN least(50, greatest(0, similarity(m.item_name, (SELECT q FROM q)) * 50)) ELSE 0 END)
        + (CASE WHEN m.is_popular = true THEN 20 ELSE 0 END)
        + (CASE WHEN m.is_recommended = true THEN 10 ELSE 0 END)
      )::double precision AS search_score,
      m.is_popular,
      m.is_recommended
    FROM public.merchant_menu_items m
    INNER JOIN within_15 s ON s.id = m.store_id
    WHERE m.is_active = true AND m.in_stock = true
      AND (
        (SELECT q FROM q) = ''
        OR lower(m.item_name) LIKE '%' || (SELECT q FROM q) || '%'
        OR lower(coalesce(m.item_description, '')) LIKE '%' || (SELECT q FROM q) || '%'
        OR lower(coalesce(m.cuisine_type, '')) LIKE '%' || (SELECT q FROM q) || '%'
        OR (m.search_vector IS NOT NULL AND m.search_vector @@ plainto_tsquery('simple', (SELECT q FROM q)))
        OR (SELECT q FROM q) <> '' AND similarity(m.item_name, (SELECT q FROM q)) > 0.2
      )
  )
  SELECT
    scored_items.item_id,
    scored_items.item_name,
    scored_items.item_description,
    scored_items.cuisine_type,
    scored_items.selling_price,
    scored_items.food_type,
    scored_items.store_id,
    scored_items.store_public_id,
    scored_items.store_name,
    scored_items.distance_km,
    scored_items.search_score,
    scored_items.is_popular,
    scored_items.is_recommended
  FROM scored_items
  ORDER BY scored_items.search_score DESC, scored_items.distance_km ASC, scored_items.is_popular DESC
  LIMIT lim;
$$;

COMMENT ON FUNCTION public.search_dishes_nearby(text, double precision, double precision, integer) IS
  'Menu items from stores within 15km. Score: exact 95, prefix 80, partial 60, fuzzy 50, popular boost 20.';
