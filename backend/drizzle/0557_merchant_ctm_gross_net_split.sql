-- Safety net if an older 0555 already added net=gross / net=gross-disc checks.
-- gross_value (catalog selling) and net_ctm_value (selling minus BOOST) must be allowed to differ.

BEGIN;

ALTER TABLE public.merchant_ctm_pricing_snapshot
  DROP CONSTRAINT IF EXISTS merchant_ctm_pricing_snapshot_bogo_none_neutral;

ALTER TABLE public.merchant_ctm_pricing_snapshot
  DROP CONSTRAINT IF EXISTS merchant_ctm_pricing_snapshot_none_neutral;

ALTER TABLE public.merchant_ctm_pricing_snapshot
  DROP CONSTRAINT IF EXISTS merchant_ctm_pricing_snapshot_net_equals_gross_minus_disc;

COMMIT;
