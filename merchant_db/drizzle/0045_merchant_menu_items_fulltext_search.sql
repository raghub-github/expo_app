-- Full-text search support for merchant_menu_items (item_name, item_description, cuisine_type).
-- Enables fast search for customer app and search API.
-- Run against the same DB that holds merchant_menu_items (e.g. Supabase/Postgres).

-- 1. Add tsvector column for search (nullable for existing rows; trigger will fill)
ALTER TABLE public.merchant_menu_items
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. Function to compute search vector from item_name, item_description, cuisine_type
CREATE OR REPLACE FUNCTION public.merchant_menu_items_search_vector_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.item_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.item_description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.cuisine_type, '')), 'A');
  RETURN NEW;
END;
$$;

-- 3. Trigger to keep search_vector updated on INSERT/UPDATE
DROP TRIGGER IF EXISTS merchant_menu_items_search_vector_trigger ON public.merchant_menu_items;
CREATE TRIGGER merchant_menu_items_search_vector_trigger
  BEFORE INSERT OR UPDATE OF item_name, item_description, cuisine_type
  ON public.merchant_menu_items
  FOR EACH ROW
  EXECUTE PROCEDURE public.merchant_menu_items_search_vector_trigger_fn();

-- 4. Backfill existing rows
UPDATE public.merchant_menu_items
SET search_vector =
  setweight(to_tsvector('english', coalesce(item_name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(item_description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(cuisine_type, '')), 'A')
WHERE search_vector IS NULL;

-- 5. GIN index for fast full-text search (only on active, in-stock for customer-facing queries)
CREATE INDEX IF NOT EXISTS merchant_menu_items_search_vector_idx
  ON public.merchant_menu_items
  USING gin (search_vector)
  WHERE is_active = true AND in_stock = true;

-- Optional: composite index for “search + store” queries (search first, then filter by store)
COMMENT ON COLUMN public.merchant_menu_items.search_vector IS 'Full-text search vector from item_name (A), item_description (B), cuisine_type (A).';

-- 6. RPC for customer-facing search (text in, items out). Builds tsquery inside.
-- Usage: SELECT * FROM search_menu_items('biryani', 20, 0);
CREATE OR REPLACE FUNCTION public.search_menu_items(
  query_text text,
  lim integer DEFAULT 20,
  off integer DEFAULT 0
)
RETURNS SETOF public.merchant_menu_items
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT *
  FROM merchant_menu_items
  WHERE is_active = true AND in_stock = true
    AND search_vector @@ plainto_tsquery('english', coalesce(trim(query_text), ''))
  ORDER BY
    ts_rank(search_vector, plainto_tsquery('english', coalesce(trim(query_text), ''))) DESC,
    is_popular DESC,
    is_recommended DESC
  LIMIT lim OFFSET off;
$$;
COMMENT ON FUNCTION public.search_menu_items(text, integer, integer) IS 'Full-text search over merchant_menu_items. Returns only active and in-stock.';
