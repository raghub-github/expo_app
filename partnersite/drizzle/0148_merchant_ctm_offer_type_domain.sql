-- Mirror of backend/drizzle/0414_merchant_ctm_offer_type_domain.sql
-- merchant_ctm_pricing_snapshot is a shared table; this keeps the partnersite migration history in
-- sync and enforces the canonical merchant offer domain regardless of which runner applies first.
-- Fully idempotent (guarded on pg_constraint) — a no-op if the backend migration already ran.
--
-- merchant_offer_type ∈ (BOOST | BOGO | NONE) only. BOGO/NONE never carry a discount (net = gross).
-- Precision (cart-level), platform coupons/campaigns, membership and wallet must NEVER appear here.

BEGIN;

-- Normalize any legacy / mislabelled rows to the canonical domain before enforcing it.
UPDATE public.merchant_ctm_pricing_snapshot
SET merchant_offer_type = 'BOGO',
    merchant_offer_discount = 0,
    net_ctm_value = gross_value
WHERE upper(merchant_offer_type) LIKE 'BOGO%'
   OR (upper(merchant_offer_type) LIKE '%BUY%' AND upper(merchant_offer_type) LIKE '%GET%')
   OR upper(merchant_offer_type) IN ('BUY_X_GET_Y', 'BUY_N_GET_M', 'FREE_ITEM', 'BUNDLE', 'COMBO');

UPDATE public.merchant_ctm_pricing_snapshot
SET merchant_offer_type = 'BOOST'
WHERE merchant_offer_type NOT IN ('BOGO', 'NONE')
  AND upper(merchant_offer_type) IN ('BOOST', 'PERCENTAGE', 'FLAT', 'HAPPY_HOUR')
  AND merchant_offer_discount > 0;

UPDATE public.merchant_ctm_pricing_snapshot
SET merchant_offer_type = 'NONE',
    merchant_offer_name = NULL,
    merchant_offer_discount = 0,
    net_ctm_value = gross_value
WHERE merchant_offer_type NOT IN ('BOOST', 'BOGO', 'NONE');

UPDATE public.merchant_ctm_pricing_snapshot
SET merchant_offer_discount = 0,
    net_ctm_value = gross_value
WHERE merchant_offer_type IN ('BOGO', 'NONE')
  AND (merchant_offer_discount <> 0 OR net_ctm_value <> gross_value);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchant_ctm_pricing_snapshot_offer_type_domain'
  ) THEN
    ALTER TABLE public.merchant_ctm_pricing_snapshot
      ADD CONSTRAINT merchant_ctm_pricing_snapshot_offer_type_domain
      CHECK (merchant_offer_type IN ('BOOST', 'BOGO', 'NONE'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchant_ctm_pricing_snapshot_bogo_none_neutral'
  ) THEN
    ALTER TABLE public.merchant_ctm_pricing_snapshot
      ADD CONSTRAINT merchant_ctm_pricing_snapshot_bogo_none_neutral
      CHECK (
        merchant_offer_type = 'BOOST'
        OR (merchant_offer_discount = 0 AND net_ctm_value = gross_value)
      );
  END IF;
END $$;

COMMIT;
