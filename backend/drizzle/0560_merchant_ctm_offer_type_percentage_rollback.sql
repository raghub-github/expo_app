BEGIN;

ALTER TABLE public.merchant_ctm_pricing_snapshot
  DROP CONSTRAINT IF EXISTS merchant_ctm_pricing_snapshot_offer_type_domain;

UPDATE public.merchant_ctm_pricing_snapshot
SET merchant_offer_type = 'BOOST'
WHERE merchant_offer_type IN ('PERCENTAGE', 'FLAT');

ALTER TABLE public.merchant_ctm_pricing_snapshot
  ADD CONSTRAINT merchant_ctm_pricing_snapshot_offer_type_domain
  CHECK (merchant_offer_type IN ('BOOST', 'BOGO', 'NONE'));

COMMIT;
