-- Canonical item CTM pricing v2.
-- Existing rows stay calculation_version = 1 (customer-catalog gross, settlement × commission factor).
-- New orders write version 2 (base CTM → merchant offer → discounted CTM → gross-up).
-- Do NOT rewrite historical snapshots.

BEGIN;

ALTER TABLE public.merchant_ctm_pricing_snapshot
  ADD COLUMN IF NOT EXISTS calculation_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_ctm_value NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS discounted_ctm_value NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS customer_item_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS merchant_offer_id BIGINT,
  ADD COLUMN IF NOT EXISTS merchant_offer_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS platform_offer_id BIGINT,
  ADD COLUMN IF NOT EXISTS platform_discount_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchant_funded_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS company_funded_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchant_settlement_ctm NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS paid_quantity NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS free_quantity NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS fulfilled_quantity NUMERIC(12, 3);

CREATE INDEX IF NOT EXISTS idx_merchant_ctm_calc_version
  ON public.merchant_ctm_pricing_snapshot(calculation_version);

COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.calculation_version IS
  '1 = legacy customer-catalog CTM (settlement reverse-scales). 2 = base CTM → merchant offer → discounted CTM → gross-up customer price.';
COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.base_ctm_value IS
  'v2: merchant base CTM line (menu net × qty + addon nets). v1: null.';
COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.discounted_ctm_value IS
  'v2: CTM after merchant item Boost. BOGO leaves this equal to base_ctm_value.';
COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.customer_item_price IS
  'v2: customer item selling line = gross-up(discounted CTM).';
COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.merchant_funded_discount IS
  'v2: platform-offer merchant share on this order (allocated), not Boost. Boost lives in merchant_offer_discount.';
COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.company_funded_discount IS
  'v2: platform-offer company/platform share. Must not reduce merchant settlement.';

ALTER TABLE public.order_settlement_breakdown
  ADD COLUMN IF NOT EXISTS calculation_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS company_funded_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_merchant_share NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_company_share NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_discount_total NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.order_settlement_breakdown.calculation_version IS
  '1 = legacy × (100-pct)/100 on catalog. 2 = merchant_gross already in discounted CTM rupees.';
COMMENT ON COLUMN public.order_settlement_breakdown.platform_merchant_share IS
  'Merchant-funded portion of platform/checkout offers. Reduces v2 merchant_gross.';
COMMENT ON COLUMN public.order_settlement_breakdown.company_funded_discount IS
  'Company/platform-funded portion of platform offers. Does not reduce merchant CTM.';

ALTER TABLE public.offer_order_applications
  ADD COLUMN IF NOT EXISTS platform_contribution NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS merchant_contribution NUMERIC(10, 2);

COMMENT ON COLUMN public.offer_order_applications.platform_contribution IS
  'Apply-time platform/company funding rupees (SSOT; do not recompute from share pct).';
COMMENT ON COLUMN public.offer_order_applications.merchant_contribution IS
  'Apply-time merchant funding rupees for this application.';

COMMIT;
