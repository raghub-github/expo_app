-- Freeze merchant-funded cart / precision discount on the order for Merchant CTM.
-- Line snapshots (0411) remain SSOT per item; this column is the cart-surface
-- precision total (merchant ₹ scale) so partner billing can always subtract it
-- even when line attribution was incomplete on older orders.

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS merchant_precision_discount NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders_core.merchant_precision_discount IS
  'Merchant store precision/cart checkout discount only (₹, CTM scale). Platform offers/coupons never stored here.';

-- Backfill: merchant store precision only (never platform offers / platform coupons).
UPDATE public.orders_core oc
SET merchant_precision_discount = GREATEST(
  0,
  COALESCE((
    SELECT ROUND(SUM((d->>'amount')::numeric)::numeric, 2)
    FROM jsonb_array_elements(COALESCE(oc.billing_snapshot->'discounts', '[]'::jsonb)) AS d
    WHERE (d->'meta'->>'merchantOfferId') IS NOT NULL
      AND NULLIF(TRIM(d->'meta'->>'merchantOfferId'), '') IS NOT NULL
      AND (d->'meta'->>'platformOfferId') IS NULL
      AND UPPER(COALESCE(d->'meta'->>'source', d->>'offerSource', '')) NOT IN ('PLATFORM', 'PLATFORM_OFFERS')
      AND COALESCE((d->'meta'->>'itemSurface')::boolean, false) IS NOT TRUE
      AND COALESCE((d->'meta'->>'item_surface')::boolean, false) IS NOT TRUE
      AND UPPER(COALESCE(d->'meta'->>'offerType', d->'meta'->>'offer_type', '')) NOT IN (
        'BOGO', 'BUY_X_GET_Y', 'BUY_N_GET_M', 'FREE_ITEM', 'BUNDLE', 'BOOST', 'FREE_DELIVERY'
      )
      AND LOWER(COALESCE(d->'meta'->>'conditionsMode', d->'meta'->>'conditions_mode', '')) NOT IN ('boost', 'bogo')
      AND (
        LOWER(COALESCE(d->'meta'->>'conditionsMode', d->'meta'->>'conditions_mode', '')) = 'precision'
        OR COALESCE((d->'meta'->>'cartSurface')::boolean, false) IS TRUE
        OR COALESCE((d->'meta'->>'cart_surface')::boolean, false) IS TRUE
        OR COALESCE((d->'meta'->>'itemSurface')::boolean, true) IS FALSE
        OR UPPER(COALESCE(d->'meta'->>'offerType', d->'meta'->>'offer_type', '')) IN (
          'CART_PERCENTAGE', 'CART_FLAT', 'PRECISION'
        )
        OR LOWER(COALESCE(d->>'label', '')) LIKE '%precision%'
      )
  ), 0)
)
WHERE oc.billing_snapshot IS NOT NULL
  AND COALESCE(oc.merchant_precision_discount, 0) <= 0.005;
