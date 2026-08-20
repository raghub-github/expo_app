-- Mirror of backend/drizzle/0555_merchant_ctm_bogo_discount.sql

BEGIN;

ALTER TABLE public.merchant_ctm_pricing_snapshot
  DROP CONSTRAINT IF EXISTS merchant_ctm_pricing_snapshot_bogo_none_neutral;

ALTER TABLE public.merchant_ctm_pricing_snapshot
  DROP CONSTRAINT IF EXISTS merchant_ctm_pricing_snapshot_none_neutral;

ALTER TABLE public.merchant_ctm_pricing_snapshot
  DROP CONSTRAINT IF EXISTS merchant_ctm_pricing_snapshot_net_equals_gross_minus_disc;

COMMIT;
