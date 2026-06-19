-- Merchant plan picker / sheet presentation fields (Subscription Plans admin).

ALTER TABLE public.merchant_plans
  ADD COLUMN IF NOT EXISTS sheet_badge_label TEXT NULL,
  ADD COLUMN IF NOT EXISTS sheet_headline TEXT NULL,
  ADD COLUMN IF NOT EXISTS sheet_cta_label TEXT NULL,
  ADD COLUMN IF NOT EXISTS benefits_json JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.merchant_plans.sheet_badge_label IS 'Badge on plan picker sheet, e.g. Popular';
COMMENT ON COLUMN public.merchant_plans.sheet_headline IS 'Marketing headline on plan picker sheet';
COMMENT ON COLUMN public.merchant_plans.sheet_cta_label IS 'CTA button label on plan picker sheet';
COMMENT ON COLUMN public.merchant_plans.benefits_json IS 'Benefit bullet strings for plan picker sheet';

UPDATE public.merchant_plans
SET sheet_badge_label = 'Popular'
WHERE is_popular = TRUE
  AND (sheet_badge_label IS NULL OR btrim(sheet_badge_label) = '');
