-- 0231: Merchant-committed food prep time (accept modal) + ready-by deadline for customer/merchant UI.

ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS prep_ready_by_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS prep_time_source TEXT NULL;

COMMENT ON COLUMN public.orders_food.prep_ready_by_at IS
  'When merchant expects food ready (accepted_at + preparation_time_minutes at accept).';
COMMENT ON COLUMN public.orders_food.prep_time_source IS
  'merchant = set at accept on portal; store_default = GatiMitra/store avg at accept without merchant change.';

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS prep_ready_by_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS prep_time_minutes INTEGER NULL;

COMMENT ON COLUMN public.orders_core.prep_ready_by_at IS
  'Mirror of orders_food.prep_ready_by_at for customer tracking APIs.';
COMMENT ON COLUMN public.orders_core.prep_time_minutes IS
  'Committed prep minutes at merchant accept (shown to customer while preparing).';

CREATE INDEX IF NOT EXISTS orders_food_prep_ready_by_at_idx
  ON public.orders_food (merchant_store_id, prep_ready_by_at)
  WHERE prep_ready_by_at IS NOT NULL;
