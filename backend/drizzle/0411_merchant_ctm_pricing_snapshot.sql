-- Merchant CTM Pricing Engine — immutable per-line merchant economics at placement.
-- Only merchant-funded offers reduce net_ctm_value. Platform coupons/campaigns never do.
-- Merchant App / settlement must read this table instead of live menu prices.

CREATE TABLE IF NOT EXISTS public.merchant_ctm_pricing_snapshot (
  id BIGSERIAL PRIMARY KEY,

  core_order_id BIGINT NOT NULL REFERENCES public.orders_core(id) ON DELETE CASCADE,
  order_item_id BIGINT NOT NULL REFERENCES public.orders_core_items(id) ON DELETE CASCADE,
  menu_item_id BIGINT,

  -- Merchant catalog line total (menu base × qty + addons) at placement, merchant-rupee base.
  gross_value NUMERIC(12, 2) NOT NULL,

  -- BOOST | BOGO | PERCENTAGE | FLAT | PRECISION | HAPPY_HOUR | COMBO | FREE_ITEM | NONE | …
  merchant_offer_type TEXT NOT NULL DEFAULT 'NONE',
  merchant_offer_name TEXT,

  -- Only restaurant-funded discount on this line (₹). Platform funding excluded.
  merchant_offer_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,

  -- gross_value − merchant_offer_discount (final merchant selling / CTM line value).
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
COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.gross_value IS
  'Merchant catalog line total at placement (before merchant-funded offers).';
COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.merchant_offer_discount IS
  'Merchant-funded discount only; platform coupons/campaigns excluded.';
COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.net_ctm_value IS
  'Final merchant CTM line value = gross_value − merchant_offer_discount.';
