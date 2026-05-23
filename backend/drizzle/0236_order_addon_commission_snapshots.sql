-- Per-addon commission lock at order placement (mirrors order_item_commission_snapshots).
-- Stores menu addon/customization ids + merchant base / customer visible / platform split per add-on line.

ALTER TABLE public.orders_core_item_addons
  ADD COLUMN IF NOT EXISTS menu_addon_id TEXT,
  ADD COLUMN IF NOT EXISTS customization_id TEXT,
  ADD COLUMN IF NOT EXISTS menu_addon_pk BIGINT;

COMMENT ON COLUMN public.orders_core_item_addons.menu_addon_id IS
  'Stable merchant_menu_item_addons.addon_id (text) from customer cart at place time.';
COMMENT ON COLUMN public.orders_core_item_addons.customization_id IS
  'merchant_menu_item_customizations.customization_id (text group id) at place time.';
COMMENT ON COLUMN public.orders_core_item_addons.menu_addon_pk IS
  'merchant_menu_item_addons.id when resolved at placement; optional legacy addon_id bigint.';

CREATE INDEX IF NOT EXISTS idx_ocs_item_addons_menu_addon_id
  ON public.orders_core_item_addons(menu_addon_id)
  WHERE menu_addon_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.order_item_addon_commission_snapshots (
  id BIGSERIAL PRIMARY KEY,

  order_id BIGINT NOT NULL REFERENCES public.orders_core(id) ON DELETE CASCADE,
  order_item_id BIGINT NOT NULL REFERENCES public.orders_core_items(id) ON DELETE CASCADE,
  order_item_addon_id BIGINT NOT NULL REFERENCES public.orders_core_item_addons(id) ON DELETE CASCADE,
  store_id BIGINT NOT NULL,

  menu_addon_id TEXT NOT NULL,
  customization_id TEXT,
  menu_addon_pk BIGINT,

  addon_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,

  merchant_base_price NUMERIC(12, 2) NOT NULL,
  commission_percent NUMERIC(5, 2) NOT NULL,
  customer_visible_price NUMERIC(12, 2) NOT NULL,
  platform_earning NUMERIC(12, 2) NOT NULL,

  source_rule_kind TEXT NOT NULL,
  source_rule_id BIGINT,
  source_plan_id BIGINT,
  source_subscription_id BIGINT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT order_item_addon_commission_snapshots_source_kind_check
    CHECK (
      source_rule_kind = ANY (
        ARRAY['DEFAULT'::text, 'STORE_OVERRIDE'::text, 'SUBSCRIPTION'::text, 'PROMOTIONAL'::text]
      )
    ),
  CONSTRAINT order_item_addon_commission_snapshots_addon_uq
    UNIQUE (order_item_addon_id)
);

CREATE INDEX IF NOT EXISTS idx_oiacs_order
  ON public.order_item_addon_commission_snapshots(order_id);

CREATE INDEX IF NOT EXISTS idx_oiacs_order_item
  ON public.order_item_addon_commission_snapshots(order_item_id);

CREATE INDEX IF NOT EXISTS idx_oiacs_store_created
  ON public.order_item_addon_commission_snapshots(store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oiacs_menu_addon
  ON public.order_item_addon_commission_snapshots(menu_addon_id);
