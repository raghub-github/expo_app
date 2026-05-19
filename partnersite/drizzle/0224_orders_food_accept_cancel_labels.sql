-- Acceptance / cancellation attribution labels for orders_food (portal, app, dashboard).

ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS accepted_by_label TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by_label TEXT;

COMMENT ON COLUMN public.orders_food.accepted_by_label IS
  'Human-readable label for who accepted (e.g. Accepted - Merchant portal (Manual), Accepted by GatiMitra Team).';

COMMENT ON COLUMN public.orders_food.cancelled_by_label IS
  'Human-readable label for who cancelled (e.g. Auto Cancelled, Cancelled - Merchant App (Manual)).';

CREATE INDEX IF NOT EXISTS orders_food_accepted_by_label_idx
  ON public.orders_food (accepted_by_label)
  WHERE accepted_by_label IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_food_cancelled_by_label_idx
  ON public.orders_food (cancelled_by_label)
  WHERE cancelled_by_label IS NOT NULL;
