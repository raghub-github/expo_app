-- Rollback redirect CTA: remap redirect rows to share, restore 2-value check.
UPDATE public.home_ads SET cta_action = 'share' WHERE cta_action = 'redirect';

ALTER TABLE public.home_ads
  DROP CONSTRAINT IF EXISTS home_ads_cta_action_check;

ALTER TABLE public.home_ads
  ADD CONSTRAINT home_ads_cta_action_check
  CHECK (cta_action IN ('bottom_sheet', 'share'));
