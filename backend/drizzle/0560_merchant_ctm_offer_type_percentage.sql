-- Persist actual store offer types (PERCENTAGE / FLAT) on CTM snapshots.
-- Historical BOOST / BOGO / NONE rows are unchanged.
-- Store-funded %/flat: gross_value = original MX, net_ctm_value = discounted MX (they must differ).

BEGIN;

ALTER TABLE public.merchant_ctm_pricing_snapshot
  DROP CONSTRAINT IF EXISTS merchant_ctm_pricing_snapshot_offer_type_domain;

ALTER TABLE public.merchant_ctm_pricing_snapshot
  ADD CONSTRAINT merchant_ctm_pricing_snapshot_offer_type_domain
  CHECK (merchant_offer_type IN ('BOOST', 'BOGO', 'NONE', 'PERCENTAGE', 'FLAT'));

COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.merchant_offer_type IS
  'Merchant item offer: PERCENTAGE | FLAT | BOOST | BOGO | NONE. Precision/coupon/membership never appear here.';
COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.gross_value IS
  'Original MX/menu CTM (before store offer and before platform commission).';
COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.net_ctm_value IS
  'Discounted MX CTM after store-funded item offer. No platform commission scaling. Equals gross only when type is NONE or BOGO.';
COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.merchant_offer_discount IS
  'Store offer discount in MX rupees (e.g. 40% of ₹149 = ₹59.60). Not the percent. BOGO/NONE: 0.';
COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.merchant_offer_name IS
  'Actual store offer title when a store offer is applied.';

COMMIT;
