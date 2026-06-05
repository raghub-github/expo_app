-- Person ride formatted_order_id uses GMP prefix (orders_core.order_type = person_ride).

CREATE OR REPLACE FUNCTION public.get_order_id_prefix(order_type_val TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE order_type_val
    WHEN 'food' THEN RETURN 'GMF';
    WHEN 'parcel' THEN RETURN 'GMC';
    WHEN 'person_ride' THEN RETURN 'GMP';
    WHEN 'ride' THEN RETURN 'GMP';
    WHEN '3pl' THEN RETURN 'GM3';
    ELSE RETURN 'GMF';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_formatted_order_id(order_type_val TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  prefix TEXT;
  next_num BIGINT;
  formatted_id TEXT;
BEGIN
  prefix := public.get_order_id_prefix(order_type_val);

  IF order_type_val = 'food' THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(formatted_order_id FROM 4) AS BIGINT)), 100000) + 1
    INTO next_num
    FROM public.orders_core
    WHERE formatted_order_id IS NOT NULL
      AND formatted_order_id ~ ('^' || prefix || '[0-9]+$');

    formatted_id := prefix || LPAD(next_num::TEXT, 6, '0');
  ELSE
    SELECT COALESCE(MAX(CAST(SUBSTRING(formatted_order_id FROM 4) AS BIGINT)), 10000) + 1
    INTO next_num
    FROM public.orders_core
    WHERE formatted_order_id IS NOT NULL
      AND formatted_order_id ~ ('^' || prefix || '[0-9]+$');

    formatted_id := prefix || LPAD(next_num::TEXT, 5, '0');
  END IF;

  RETURN formatted_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_formatted_order_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.formatted_order_id IS NULL AND NEW.order_type IS NOT NULL THEN
    NEW.formatted_order_id := public.generate_formatted_order_id(NEW.order_type::TEXT);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_core_formatted_order_id_trigger ON public.orders_core;
CREATE TRIGGER orders_core_formatted_order_id_trigger
  BEFORE INSERT ON public.orders_core
  FOR EACH ROW
  EXECUTE FUNCTION public.set_formatted_order_id();

-- Backfill person_ride rows missing formatted_order_id.
DO $$
DECLARE
  rec RECORD;
  ride_counter BIGINT := 10001;
  formatted_id TEXT;
BEGIN
  FOR rec IN
    SELECT id
    FROM public.orders_core
    WHERE order_type = 'person_ride'::order_type
      AND formatted_order_id IS NULL
    ORDER BY id ASC
  LOOP
    SELECT COALESCE(MAX(CAST(SUBSTRING(formatted_order_id FROM 4) AS BIGINT)), 10000) + 1
    INTO ride_counter
    FROM public.orders_core
    WHERE formatted_order_id IS NOT NULL
      AND formatted_order_id ~ '^GMP[0-9]+$';

    formatted_id := 'GMP' || LPAD(ride_counter::TEXT, 5, '0');

    UPDATE public.orders_core
    SET formatted_order_id = formatted_id
    WHERE id = rec.id;
  END LOOP;
END $$;

COMMENT ON COLUMN public.orders_core.formatted_order_id IS
  'Human-readable order ID: GMF100001 (food), GMC10001 (parcel), GMP10001 (person_ride).';
