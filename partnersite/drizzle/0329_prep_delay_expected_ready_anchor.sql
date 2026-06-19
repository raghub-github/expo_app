-- Need more time: extend expected_ready_at without moving prep_ready_by_at (delay analytics anchor).

ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS expected_ready_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_prep_delay_minutes_added INTEGER NULL;

COMMENT ON COLUMN public.orders_food.expected_ready_at IS
  'Working ready ETA shown to customer / Order Ready countdown; updated on Need more time (now + extension).';
COMMENT ON COLUMN public.orders_food.last_prep_delay_minutes_added IS
  'Minutes from the most recent Need more time selection (for merchant UI label).';

UPDATE public.orders_food
SET expected_ready_at = prep_ready_by_at
WHERE expected_ready_at IS NULL
  AND prep_ready_by_at IS NOT NULL;

UPDATE public.orders_core oc
SET expected_ready_at = COALESCE(oc.expected_ready_at, oc.prep_ready_by_at, of.prep_ready_by_at)
FROM public.orders_food of
WHERE of.order_id = oc.id
  AND oc.expected_ready_at IS NULL
  AND (oc.prep_ready_by_at IS NOT NULL OR of.prep_ready_by_at IS NOT NULL);
