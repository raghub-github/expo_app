-- Merchant CTM snapshot — enforce the canonical per-item offer domain at the storage layer.
--
-- merchant_ctm_pricing_snapshot.merchant_offer_type is a MERCHANT-facing classification and may
-- only ever be one of three values:
--   BOOST  — an item-surface %/flat merchant offer on an ITEM_PROMO line (net = gross − discount)
--   BOGO   — any buy-get / free-unit deal                (discount = 0, net = gross)
--   NONE   — no merchant ITEM offer on this line          (discount = 0, net = gross)
--
-- Merchant Precision (cart-level), platform coupons/campaigns, membership and wallet must NEVER
-- reach this table. The persistence layer already projects each row 1:1 from its own
-- orders_core_items line, so these constraints are defense-in-depth: if any future code path ever
-- tries to write a leaked PERCENTAGE / PRECISION / COUPON type — or a BOGO/NONE row that still
-- carries a discount — the INSERT fails loudly instead of silently corrupting merchant economics.

BEGIN;

-- 1) Normalize any legacy / mislabelled rows to the canonical domain BEFORE enforcing it.

-- 1a) Any buy-get / free-unit / bundle family → BOGO (discount never belongs on a BOGO line).
UPDATE public.merchant_ctm_pricing_snapshot
SET merchant_offer_type = 'BOGO',
    merchant_offer_discount = 0,
    net_ctm_value = gross_value
WHERE upper(merchant_offer_type) LIKE 'BOGO%'
   OR (upper(merchant_offer_type) LIKE '%BUY%' AND upper(merchant_offer_type) LIKE '%GET%')
   OR upper(merchant_offer_type) IN ('BUY_X_GET_Y', 'BUY_N_GET_M', 'FREE_ITEM', 'BUNDLE', 'COMBO');

-- 1b) A genuine item-surface %/flat/boost row that actually reduced the line → BOOST.
UPDATE public.merchant_ctm_pricing_snapshot
SET merchant_offer_type = 'BOOST'
WHERE merchant_offer_type NOT IN ('BOGO', 'NONE')
  AND upper(merchant_offer_type) IN ('BOOST', 'PERCENTAGE', 'FLAT', 'HAPPY_HOUR')
  AND merchant_offer_discount > 0;

-- 1c) Everything else non-canonical (Precision / cart / coupon attributions, zero-discount %/flat,
--     unknown spellings) is NOT a merchant item offer → NONE, with its economics reset so net = gross.
UPDATE public.merchant_ctm_pricing_snapshot
SET merchant_offer_type = 'NONE',
    merchant_offer_name = NULL,
    merchant_offer_discount = 0,
    net_ctm_value = gross_value
WHERE merchant_offer_type NOT IN ('BOOST', 'BOGO', 'NONE');

-- 1d) Repair any BOGO/NONE row that still carries a stray discount (must be zero, net = gross).
UPDATE public.merchant_ctm_pricing_snapshot
SET merchant_offer_discount = 0,
    net_ctm_value = gross_value
WHERE merchant_offer_type IN ('BOGO', 'NONE')
  AND (merchant_offer_discount <> 0 OR net_ctm_value <> gross_value);

-- 2) Enforce the offer-type domain (idempotent).
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

-- 3) Enforce the per-case economics: BOGO & NONE never carry a discount and never reduce CTM.
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

COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.merchant_offer_type IS
  'Canonical merchant ITEM offer only: BOOST | BOGO | NONE. Precision/coupon/membership/wallet never appear here.';

COMMIT;
