BEGIN;

ALTER TABLE public.orders_food
  DROP CONSTRAINT IF EXISTS orders_food_acceptance_source_chk;

DROP INDEX IF EXISTS public.orders_food_acceptance_source_idx;

ALTER TABLE public.orders_food
  DROP COLUMN IF EXISTS acceptance_source;

COMMIT;
