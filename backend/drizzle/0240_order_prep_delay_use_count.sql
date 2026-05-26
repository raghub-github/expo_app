-- 0240: Track how many times merchant used "Need more time" (1× normal, 2× bulk).

ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS prep_delay_use_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders_food.prep_delay_use_count IS
  'Number of Need more time extensions applied (max 1 normal, 2 bulk).';

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS prep_delay_use_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders_core.prep_delay_use_count IS
  'Mirror of orders_food.prep_delay_use_count for customer tracking.';

UPDATE public.orders_food
SET prep_delay_use_count = 1
WHERE prep_delay_minutes > 0 AND prep_delay_use_count = 0;

UPDATE public.orders_core oc
SET prep_delay_use_count = 1
FROM public.orders_food of
WHERE of.order_id = oc.id
  AND of.prep_delay_minutes > 0
  AND oc.prep_delay_use_count = 0;
