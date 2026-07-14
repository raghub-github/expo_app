-- Rollback for 0414_merchant_ctm_offer_type_domain.sql
-- Drops the CTM offer-type domain / economics CHECK constraints. Data normalized in the forward
-- migration is intentionally NOT reverted (the pre-normalization values were the corrupt state).

BEGIN;

ALTER TABLE public.merchant_ctm_pricing_snapshot
  DROP CONSTRAINT IF EXISTS merchant_ctm_pricing_snapshot_bogo_none_neutral;

ALTER TABLE public.merchant_ctm_pricing_snapshot
  DROP CONSTRAINT IF EXISTS merchant_ctm_pricing_snapshot_offer_type_domain;

COMMIT;
