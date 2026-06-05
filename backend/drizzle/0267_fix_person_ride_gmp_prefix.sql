-- Fix person_ride rows that got GMF/GMC prefix before person_ride → GMP mapping existed.

DO $$
DECLARE
  rec RECORD;
  next_num BIGINT;
  formatted_id TEXT;
BEGIN
  FOR rec IN
    SELECT id
    FROM public.orders_core
    WHERE order_type = 'person_ride'::order_type
      AND (formatted_order_id IS NULL OR formatted_order_id !~ '^GMP[0-9]+$')
    ORDER BY id ASC
  LOOP
    SELECT COALESCE(MAX(CAST(SUBSTRING(formatted_order_id FROM 4) AS BIGINT)), 10000) + 1
    INTO next_num
    FROM public.orders_core
    WHERE formatted_order_id ~ '^GMP[0-9]+$';

    formatted_id := 'GMP' || LPAD(next_num::TEXT, 5, '0');

    UPDATE public.orders_core
    SET formatted_order_id = formatted_id
    WHERE id = rec.id;
  END LOOP;
END $$;
