-- Mirror of backend/drizzle/0411_merchant_ctm_pricing_snapshot.sql
-- Immutable Merchant CTM line pricing frozen at checkout.

CREATE TABLE IF NOT EXISTS public.merchant_ctm_pricing_snapshot (
  id BIGSERIAL PRIMARY KEY,

  core_order_id BIGINT NOT NULL REFERENCES public.orders_core(id) ON DELETE CASCADE,
  order_item_id BIGINT NOT NULL REFERENCES public.orders_core_items(id) ON DELETE CASCADE,
  menu_item_id BIGINT,

  gross_value NUMERIC(12, 2) NOT NULL,
  merchant_offer_type TEXT NOT NULL DEFAULT 'NONE',
  merchant_offer_name TEXT,
  merchant_offer_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_ctm_value NUMERIC(12, 2) NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT merchant_ctm_pricing_snapshot_order_item_uid UNIQUE (order_item_id),
  CONSTRAINT merchant_ctm_pricing_snapshot_net_check
    CHECK (net_ctm_value >= 0 AND merchant_offer_discount >= 0 AND gross_value >= 0)
);

CREATE INDEX IF NOT EXISTS idx_merchant_ctm_core_order
  ON public.merchant_ctm_pricing_snapshot(core_order_id);
CREATE INDEX IF NOT EXISTS idx_merchant_ctm_menu_item
  ON public.merchant_ctm_pricing_snapshot(menu_item_id)
  WHERE menu_item_id IS NOT NULL;

COMMENT ON TABLE public.merchant_ctm_pricing_snapshot IS
  'Immutable Merchant CTM line pricing frozen at checkout. SSOT for merchant-facing order screens.';
