-- Mirror of backend/drizzle/0555_merchant_ctm_bogo_discount_rollback.sql

BEGIN;

ALTER TABLE public.merchant_ctm_pricing_snapshot
  DROP CONSTRAINT IF EXISTS merchant_ctm_pricing_snapshot_none_neutral;

ALTER TABLE public.merchant_ctm_pricing_snapshot
  DROP CONSTRAINT IF EXISTS merchant_ctm_pricing_snapshot_net_equals_gross_minus_disc;

UPDATE public.merchant_ctm_pricing_snapshot
SET merchant_offer_discount = 0,
    net_ctm_value = gross_value
WHERE merchant_offer_type IN ('BOGO', 'NONE')
  AND (merchant_offer_discount <> 0 OR net_ctm_value <> gross_value);

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
