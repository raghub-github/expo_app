-- GatiMitra merchant offer discount buckets for payout section B (replaces Zomato-style labels).

ALTER TABLE public.order_settlement_breakdown
  ADD COLUMN IF NOT EXISTS coupon_offer_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentage_flat_offer_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS combo_offer_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_delivery_offer_discount NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.order_settlement_breakdown.coupon_offer_discount IS
  'COUPON merchant_offers discount (payout B).';
COMMENT ON COLUMN public.order_settlement_breakdown.percentage_flat_offer_discount IS
  'PERCENTAGE, FLAT, CART_%, CART_FLAT, TIERED merchant_offers (payout B).';
COMMENT ON COLUMN public.order_settlement_breakdown.combo_offer_discount IS
  'BOGO, BUY_X_GET_Y, BUY_N_GET_M, FREE_ITEM, BUNDLE merchant_offers (payout B).';
COMMENT ON COLUMN public.order_settlement_breakdown.free_delivery_offer_discount IS
  'FREE_DELIVERY merchant_offers (payout B).';

UPDATE public.order_settlement_breakdown
SET
  coupon_offer_discount = COALESCE(
    NULLIF(coupon_offer_discount, 0),
    NULLIF(promo_discount, 0),
    coupon_discount,
    0
  ),
  percentage_flat_offer_discount = COALESCE(
    NULLIF(percentage_flat_offer_discount, 0),
    NULLIF(other_restaurant_discount, 0),
    merchant_funded_discount,
    0
  ),
  combo_offer_discount = COALESCE(combo_offer_discount, 0),
  free_delivery_offer_discount = COALESCE(
    NULLIF(free_delivery_offer_discount, 0),
    NULLIF(delivery_charge_discount, 0),
    delivery_fee,
    0
  )
WHERE TRUE;

-- Ledger metadata backfill for merchant app payout summary
UPDATE public.merchant_wallet_ledger l
SET metadata = COALESCE(l.metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
  'coupon_offer_discount', COALESCE(NULLIF(osb.coupon_offer_discount, 0), osb.promo_discount, osb.coupon_discount, 0),
  'percentage_flat_offer_discount', COALESCE(NULLIF(osb.percentage_flat_offer_discount, 0), osb.other_restaurant_discount, osb.merchant_funded_discount, 0),
  'combo_offer_discount', COALESCE(osb.combo_offer_discount, 0),
  'free_delivery_offer_discount', COALESCE(NULLIF(osb.free_delivery_offer_discount, 0), osb.delivery_charge_discount, osb.delivery_fee, 0)
))
FROM public.orders_food f
INNER JOIN public.order_settlement_breakdown osb ON osb.order_id = f.order_id
WHERE l.category = 'ORDER_EARNING'::wallet_transaction_category
  AND l.direction = 'CREDIT'
  AND l.reference_type = 'ORDER'::wallet_reference_type
  AND l.reference_id = f.id;
