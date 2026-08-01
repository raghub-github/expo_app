-- =============================================================================
-- 0473: Hide stores with zero customer-visible menu items
-- =============================================================================
-- A store is customer-visible only when it has ≥1 menu item that is:
--   APPROVED, active, not deleted, not plan-locked, and effectively in stock.
-- Listings (nearby RPC + fallbacks) require has_customer_visible_menu = true.
-- Triggers keep the flag fresh so Supabase realtime on merchant_stores can
-- invalidate customer home/search caches instantly.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Column
-- -----------------------------------------------------------------------------
ALTER TABLE public.merchant_stores
  ADD COLUMN IF NOT EXISTS has_customer_visible_menu BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.merchant_stores.has_customer_visible_menu IS
  'True when store has ≥1 customer-visible menu item (APPROVED, active, unlocked, in stock).';

CREATE INDEX IF NOT EXISTS merchant_stores_has_customer_visible_menu_idx
  ON public.merchant_stores (has_customer_visible_menu)
  WHERE has_customer_visible_menu = true;

-- -----------------------------------------------------------------------------
-- 2. Does this store have ≥1 sellable customer menu item?
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_has_customer_visible_menu(p_store_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.merchant_menu_items mmi
    LEFT JOIN public.merchant_menu_categories c
      ON c.id = mmi.category_id
     AND c.store_id = mmi.store_id
     AND COALESCE(c.is_deleted, FALSE) = FALSE
    WHERE mmi.store_id = p_store_id
      AND COALESCE(mmi.is_deleted, FALSE) = FALSE
      AND mmi.is_active IS TRUE
      AND mmi.approval_status::text = 'APPROVED'
      AND COALESCE(mmi.is_locked_by_plan, FALSE) = FALSE
      AND NOT (
        COALESCE(mmi.out_of_stock_manual, FALSE) = TRUE
        OR (mmi.out_of_stock_until IS NOT NULL AND mmi.out_of_stock_until > NOW())
        OR (
          (COALESCE(c.out_of_stock_manual, FALSE) = TRUE
            OR (c.out_of_stock_until IS NOT NULL AND c.out_of_stock_until > NOW()))
          AND c.out_of_stock_updated_at IS NOT NULL
          AND mmi.out_of_stock_updated_at IS NOT NULL
          AND c.out_of_stock_updated_at = mmi.out_of_stock_updated_at
        )
        OR (
          COALESCE(mmi.out_of_stock_manual, FALSE) = FALSE
          AND mmi.out_of_stock_until IS NULL
          AND mmi.in_stock IS FALSE
          AND mmi.out_of_stock_updated_at IS NULL
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.refresh_store_customer_visible_menu(p_store_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_has boolean;
BEGIN
  IF p_store_id IS NULL OR p_store_id <= 0 THEN
    RETURN;
  END IF;
  v_has := public.store_has_customer_visible_menu(p_store_id);
  UPDATE public.merchant_stores
  SET has_customer_visible_menu = v_has,
      updated_at = NOW()
  WHERE id = p_store_id
    AND has_customer_visible_menu IS DISTINCT FROM v_has;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Trigger on menu item changes
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_refresh_store_customer_visible_menu()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_store_customer_visible_menu(OLD.store_id);
    RETURN OLD;
  END IF;
  PERFORM public.refresh_store_customer_visible_menu(NEW.store_id);
  IF TG_OP = 'UPDATE' AND OLD.store_id IS DISTINCT FROM NEW.store_id THEN
    PERFORM public.refresh_store_customer_visible_menu(OLD.store_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_menu_items_refresh_customer_visible ON public.merchant_menu_items;
CREATE TRIGGER merchant_menu_items_refresh_customer_visible
AFTER INSERT OR UPDATE OR DELETE ON public.merchant_menu_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_store_customer_visible_menu();

-- Category OOS flips can hide/show every item in the category without touching items.
CREATE OR REPLACE FUNCTION public.trg_refresh_store_customer_visible_menu_from_category()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_store_customer_visible_menu(OLD.store_id);
    RETURN OLD;
  END IF;
  PERFORM public.refresh_store_customer_visible_menu(NEW.store_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_menu_categories_refresh_customer_visible ON public.merchant_menu_categories;
CREATE TRIGGER merchant_menu_categories_refresh_customer_visible
AFTER UPDATE OF out_of_stock_manual, out_of_stock_until, out_of_stock_updated_at, is_deleted, is_active
ON public.merchant_menu_categories
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_store_customer_visible_menu_from_category();

-- -----------------------------------------------------------------------------
-- 4. Backfill
-- -----------------------------------------------------------------------------
UPDATE public.merchant_stores ms
SET has_customer_visible_menu = public.store_has_customer_visible_menu(ms.id),
    updated_at = NOW()
WHERE has_customer_visible_menu IS DISTINCT FROM public.store_has_customer_visible_menu(ms.id);

-- -----------------------------------------------------------------------------
-- 5. Nearby RPC — exclude empty / fully-locked catalogs
-- -----------------------------------------------------------------------------
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
      AND ms.has_customer_visible_menu IS TRUE
      AND ms.latitude IS NOT NULL
      AND ms.longitude IS NOT NULL
      AND (
        NOT COALESCE(veg_mode, false)
        OR ms.is_pure_veg IS TRUE
        OR EXISTS (
          SELECT 1
          FROM public.merchant_menu_items mmi
          WHERE mmi.store_id = ms.id
            AND COALESCE(mmi.is_deleted, FALSE) = FALSE
            AND mmi.is_active IS TRUE
            AND mmi.approval_status::text = 'APPROVED'
            AND COALESCE(mmi.is_locked_by_plan, FALSE) = FALSE
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
  'Nearby ACTIVE stores with ≥1 customer-visible menu item. Includes closed stores; empty catalogs excluded.';

GRANT EXECUTE ON FUNCTION public.get_nearby_merchant_stores(double precision, double precision, double precision, integer, boolean)
  TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.store_has_customer_visible_menu(bigint) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_store_customer_visible_menu(bigint) TO service_role;
