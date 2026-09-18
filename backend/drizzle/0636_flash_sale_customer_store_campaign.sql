-- FOOD FLASH_SALE: one successful use per (customer, store, campaign).
-- Ride/Parcel FLASH_SALE (no store_id) keeps one use per (customer, campaign).
-- I/O-safe: additive indexes + backfill store_id where possible; no catalogue price changes.

-- Backfill store_id from orders_core.merchant_store_id when missing (FOOD rows only).
UPDATE public.flash_sale_redemptions r
SET store_id = oc.merchant_store_id,
    updated_at = now()
FROM public.orders_core oc
WHERE r.store_id IS NULL
  AND r.order_id IS NOT NULL
  AND oc.id = r.order_id
  AND oc.merchant_store_id IS NOT NULL
  AND UPPER(COALESCE(r.service_type, 'FOOD')) IN ('FOOD', 'ALL');

UPDATE public.flash_sale_redemptions r
SET store_id = oc.merchant_store_id,
    updated_at = now()
FROM public.orders_core oc
WHERE r.store_id IS NULL
  AND r.order_id_text IS NOT NULL
  AND length(trim(r.order_id_text)) > 0
  AND oc.order_id = r.order_id_text
  AND oc.merchant_store_id IS NOT NULL
  AND UPPER(COALESCE(r.service_type, 'FOOD')) IN ('FOOD', 'ALL');

-- Drop legacy customer+offer uniqueness (blocked multi-outlet: store A blocked store B).
DROP INDEX IF EXISTS public.flash_sale_redemptions_customer_offer_active_uidx;

-- FOOD / store-targeted: customer × store × campaign
CREATE UNIQUE INDEX IF NOT EXISTS flash_sale_redemptions_customer_store_offer_active_uidx
  ON public.flash_sale_redemptions (customer_id, store_id, platform_offer_id)
  WHERE status IN ('reserved', 'consumed')
    AND store_id IS NOT NULL;

-- Ride / Parcel (no store): customer × campaign
CREATE UNIQUE INDEX IF NOT EXISTS flash_sale_redemptions_customer_offer_nostore_active_uidx
  ON public.flash_sale_redemptions (customer_id, platform_offer_id)
  WHERE status IN ('reserved', 'consumed')
    AND store_id IS NULL;

CREATE INDEX IF NOT EXISTS flash_sale_redemptions_customer_store_status_idx
  ON public.flash_sale_redemptions (customer_id, store_id, status)
  WHERE store_id IS NOT NULL;

-- FOOD Flash Sale: per-user cap is store-scoped via flash_sale_redemptions,
-- not platform_offer_usages.max_uses_per_user (which is offer-global).
UPDATE public.billing_platform_offers
SET max_uses_per_user = NULL,
    updated_at = now()
WHERE UPPER(offer_kind) = 'FLASH_SALE'
  AND UPPER(COALESCE(service_type, 'FOOD')) IN ('FOOD', 'ALL');

COMMENT ON TABLE public.flash_sale_redemptions IS
  'Flash Sale redemption ledger. FOOD: one active use per (customer_id, store_id, platform_offer_id). Ride/Parcel: one active use per (customer_id, platform_offer_id) when store_id IS NULL. Catalogue prices are never mutated.';
