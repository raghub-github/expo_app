-- Commission Engine v2 — Phase 2 of 4
--
-- Locks the commission % + resolver decision at order placement so that future
-- rule changes never retroactively alter a placed order's economics.
-- Settlement queries can JOIN this table instead of parsing orders_core.billing_snapshot JSON.

CREATE TABLE IF NOT EXISTS public.order_item_commission_snapshots (
  id BIGSERIAL PRIMARY KEY,

  order_id      BIGINT NOT NULL REFERENCES public.orders_core(id) ON DELETE CASCADE,
  order_item_id BIGINT NOT NULL REFERENCES public.orders_core_items(id) ON DELETE CASCADE,
  store_id      BIGINT NOT NULL,

  -- Pricing breakdown — what the merchant entered, what the customer saw, who got what.
  merchant_base_price    NUMERIC(12, 2) NOT NULL,
  commission_percent     NUMERIC(5, 2)  NOT NULL,
  customer_visible_price NUMERIC(12, 2) NOT NULL,
  platform_earning       NUMERIC(12, 2) NOT NULL,

  -- Why this percent was chosen — resolver decision trace.
  source_rule_kind TEXT NOT NULL,
  source_rule_id        BIGINT NULL,
  source_plan_id        BIGINT NULL,
  source_subscription_id BIGINT NULL,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT order_item_commission_snapshots_source_kind_check
    CHECK (source_rule_kind IN ('DEFAULT', 'STORE_OVERRIDE', 'SUBSCRIPTION', 'PROMOTIONAL'))
);

CREATE INDEX IF NOT EXISTS idx_oics_order        ON public.order_item_commission_snapshots(order_id);
CREATE INDEX IF NOT EXISTS idx_oics_order_item   ON public.order_item_commission_snapshots(order_item_id);
CREATE INDEX IF NOT EXISTS idx_oics_store_created ON public.order_item_commission_snapshots(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oics_subscription ON public.order_item_commission_snapshots(source_subscription_id)
  WHERE source_subscription_id IS NOT NULL;
