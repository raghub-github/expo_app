BEGIN;

ALTER TABLE public.offer_order_applications
  DROP COLUMN IF EXISTS platform_contribution,
  DROP COLUMN IF EXISTS merchant_contribution;

ALTER TABLE public.order_settlement_breakdown
  DROP COLUMN IF EXISTS calculation_version,
  DROP COLUMN IF EXISTS company_funded_discount,
  DROP COLUMN IF EXISTS platform_merchant_share,
  DROP COLUMN IF EXISTS platform_company_share,
  DROP COLUMN IF EXISTS platform_discount_total;

ALTER TABLE public.merchant_ctm_pricing_snapshot
  DROP COLUMN IF EXISTS calculation_version,
  DROP COLUMN IF EXISTS base_ctm_value,
  DROP COLUMN IF EXISTS discounted_ctm_value,
  DROP COLUMN IF EXISTS commission_percent,
  DROP COLUMN IF EXISTS commission_amount,
  DROP COLUMN IF EXISTS customer_item_price,
  DROP COLUMN IF EXISTS merchant_offer_id,
  DROP COLUMN IF EXISTS merchant_offer_snapshot,
  DROP COLUMN IF EXISTS platform_offer_id,
  DROP COLUMN IF EXISTS platform_discount_total,
  DROP COLUMN IF EXISTS merchant_funded_discount,
  DROP COLUMN IF EXISTS company_funded_discount,
  DROP COLUMN IF EXISTS merchant_settlement_ctm,
  DROP COLUMN IF EXISTS paid_quantity,
  DROP COLUMN IF EXISTS free_quantity,
  DROP COLUMN IF EXISTS fulfilled_quantity;

COMMIT;
