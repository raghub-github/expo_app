-- ============================================================================
-- POPULAR LOCATIONS – self-learning delivery search (Zomato/Swiggy-style)
-- City/area suggestions, usage_count from orders, search_rank for city→areas.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.popular_locations (
  id BIGSERIAL PRIMARY KEY,

  city_name TEXT NOT NULL,
  area_name TEXT NOT NULL,
  display_name TEXT,
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,

  search_rank SMALLINT DEFAULT 0,
  usage_count BIGINT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.popular_locations IS 'Delivery locations learned from orders; powers local search fallback and city→area suggestions.';

CREATE INDEX IF NOT EXISTS idx_popular_locations_city
  ON public.popular_locations(LOWER(TRIM(city_name)));

CREATE INDEX IF NOT EXISTS idx_popular_locations_area
  ON public.popular_locations(LOWER(TRIM(area_name)));

CREATE INDEX IF NOT EXISTS idx_popular_locations_usage
  ON public.popular_locations(usage_count DESC);

CREATE INDEX IF NOT EXISTS idx_popular_locations_city_usage
  ON public.popular_locations(LOWER(TRIM(city_name)), usage_count DESC);

-- Full-text search for area/city (optional; improves fuzzy search)
CREATE INDEX IF NOT EXISTS idx_popular_locations_search
  ON public.popular_locations USING gin(to_tsvector('simple', COALESCE(area_name, '') || ' ' || COALESCE(city_name, '') || ' ' || COALESCE(display_name, '')));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_popular_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS popular_locations_updated_at ON public.popular_locations;
CREATE TRIGGER popular_locations_updated_at
  BEFORE UPDATE ON public.popular_locations
  FOR EACH ROW EXECUTE FUNCTION update_popular_locations_updated_at();
