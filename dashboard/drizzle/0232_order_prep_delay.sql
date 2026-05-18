-- 0232: Merchant prep delay extensions + late preparation tracking (customer + picked-up UI).

ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS prep_delay_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prepared_late_minutes INTEGER NULL;

COMMENT ON COLUMN public.orders_food.prep_delay_minutes IS
  'Total extra minutes merchant added via Need more time (5/10/15).';
COMMENT ON COLUMN public.orders_food.prepared_late_minutes IS
  'Minutes late when marked ready (prepared_at vs prep_ready_by_at); shown on picked-up card.';

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS prep_delay_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prepared_late_minutes INTEGER NULL;

COMMENT ON COLUMN public.orders_core.prep_delay_minutes IS
  'Mirror of orders_food.prep_delay_minutes for customer tracking.';
COMMENT ON COLUMN public.orders_core.prepared_late_minutes IS
  'Mirror of orders_food.prepared_late_minutes for customer tracking.';
