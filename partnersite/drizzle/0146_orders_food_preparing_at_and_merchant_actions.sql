-- Preparing timestamp + merchant order action audit trail (action_source: app | website | admin | api | system)

ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS preparing_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders_food.preparing_at IS 'When merchant marked order as preparing (kitchen started).';

CREATE TABLE IF NOT EXISTS public.merchant_order_food_actions (
  id BIGSERIAL PRIMARY KEY,
  orders_food_id BIGINT REFERENCES public.orders_food(id) ON DELETE CASCADE,
  orders_core_id BIGINT NOT NULL REFERENCES public.orders_core(id) ON DELETE CASCADE,
  merchant_store_id BIGINT REFERENCES public.merchant_stores(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  action_source TEXT NOT NULL DEFAULT 'website'
    CHECK (action_source IN ('app', 'website', 'admin', 'api', 'system')),
  actor_type TEXT NOT NULL DEFAULT 'merchant',
  actor_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_order_food_actions_core_id_created_idx
  ON public.merchant_order_food_actions (orders_core_id, created_at DESC);

CREATE INDEX IF NOT EXISTS merchant_order_food_actions_food_id_created_idx
  ON public.merchant_order_food_actions (orders_food_id, created_at DESC)
  WHERE orders_food_id IS NOT NULL;

COMMENT ON TABLE public.merchant_order_food_actions IS
  'Audit log for merchant-driven food order status changes with action_source (app, website, admin, api).';
