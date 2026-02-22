-- Order placement auto-update: current_status, merchant_parent_id, pickup/drop normalized & geocoded, distance_km.
-- All derived server-side in a BEFORE INSERT trigger; never trust frontend for these.
-- Requires: merchant_stores (id, parent_id, full_address, latitude, longitude) in same DB.

CREATE OR REPLACE FUNCTION set_order_derived_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  p_lat DOUBLE PRECISION;
  p_lon DOUBLE PRECISION;
  d_lat DOUBLE PRECISION;
  d_lon DOUBLE PRECISION;
BEGIN
  -- 1) current_status: set immediately after order creation
  IF NEW.current_status IS NULL OR NEW.current_status = '' THEN
    NEW.current_status := 'CREATED';
  END IF;

  -- 2) merchant_parent_id, pickup address and coords from merchant_stores (never from frontend)
  IF NEW.merchant_store_id IS NOT NULL THEN
    SELECT ms.parent_id,
           ms.full_address,
           ms.latitude,
           ms.longitude
      INTO NEW.merchant_parent_id,
           NEW.pickup_address_normalized,
           p_lat,
           p_lon
      FROM merchant_stores ms
     WHERE ms.id = NEW.merchant_store_id;

    IF FOUND AND p_lat IS NOT NULL AND p_lon IS NOT NULL THEN
      NEW.pickup_address_geocoded := json_build_object('lat', p_lat, 'lng', p_lon)::TEXT;
    END IF;
  END IF;

  -- 3) drop_address_normalized & drop_address_geocoded from existing NEW values (already from customer address)
  IF NEW.drop_address_raw IS NOT NULL AND TRIM(NEW.drop_address_raw) != '' THEN
    NEW.drop_address_normalized := TRIM(NEW.drop_address_raw);
  END IF;
  BEGIN
    d_lat := NEW.drop_lat::DOUBLE PRECISION;
    d_lon := NEW.drop_lon::DOUBLE PRECISION;
    IF d_lat IS NOT NULL AND d_lon IS NOT NULL THEN
      NEW.drop_address_geocoded := json_build_object('lat', d_lat, 'lng', d_lon)::TEXT;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 4) distance_km: Haversine server-side (never trust frontend)
  BEGIN
    p_lat := COALESCE(
      (SELECT ms.latitude::DOUBLE PRECISION FROM merchant_stores ms WHERE ms.id = NEW.merchant_store_id),
      NEW.pickup_lat::DOUBLE PRECISION
    );
    p_lon := COALESCE(
      (SELECT ms.longitude::DOUBLE PRECISION FROM merchant_stores ms WHERE ms.id = NEW.merchant_store_id),
      NEW.pickup_lon::DOUBLE PRECISION
    );
    d_lat := NEW.drop_lat::DOUBLE PRECISION;
    d_lon := NEW.drop_lon::DOUBLE PRECISION;
    IF p_lat IS NOT NULL AND p_lon IS NOT NULL AND d_lat IS NOT NULL AND d_lon IS NOT NULL THEN
      NEW.distance_km := ROUND(
        6371 * acos(
          LEAST(1, GREATEST(-1,
            cos(radians(p_lat)) * cos(radians(d_lat)) * cos(radians(d_lon) - radians(p_lon))
            + sin(radians(p_lat)) * sin(radians(d_lat))
          ))
        )::NUMERIC,
        2
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_core_derived_fields_trigger ON public.orders_core;
CREATE TRIGGER orders_core_derived_fields_trigger
  BEFORE INSERT ON public.orders_core
  FOR EACH ROW
  EXECUTE FUNCTION set_order_derived_fields();

COMMENT ON FUNCTION set_order_derived_fields() IS 'Auto-fills current_status, merchant_parent_id, pickup/drop normalized & geocoded, distance_km on order insert. Backend only.';
