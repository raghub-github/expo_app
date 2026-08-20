-- CTM snapshot economics:
--   gross_value = catalog selling price (menu ₹, before commission)
--   net_ctm_value = selling − BOOST (BOGO / NONE leave net = selling)
-- Platform commission is settlement-only and is not stored in these two columns.
-- Drop constraints that forced net = gross or net = gross - disc.

BEGIN;

ALTER TABLE public.merchant_ctm_pricing_snapshot
    DROP CONSTRAINT IF EXISTS merchant_ctm_pricing_snapshot_bogo_none_neutral;

ALTER TABLE public.merchant_ctm_pricing_snapshot
    DROP CONSTRAINT IF EXISTS merchant_ctm_pricing_snapshot_none_neutral;

ALTER TABLE public.merchant_ctm_pricing_snapshot
    DROP CONSTRAINT IF EXISTS merchant_ctm_pricing_snapshot_net_equals_gross_minus_disc;

COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.gross_value IS
  'Catalog selling price (menu ₹, before platform commission).';

COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.net_ctm_value IS
  'Catalog selling price minus BOOST store-offer ₹. BOGO / NONE leave this equal to gross_value. Platform commission is not stored here.';

COMMENT ON COLUMN public.merchant_ctm_pricing_snapshot.merchant_offer_discount IS
  'BOOST: applied store-offer ₹. BOGO/NONE: 0.';

COMMIT;
