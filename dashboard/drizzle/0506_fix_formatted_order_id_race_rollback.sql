-- Rollback 0506: restore generate_formatted_order_id without advisory lock.
-- Does not remove backfilled orders_parcel rows.

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
