-- Home Ads: CTA action (bottom sheet vs share) + sheet content fields.
ALTER TABLE public.home_ads
  ADD COLUMN IF NOT EXISTS cta_action text NOT NULL DEFAULT 'share';

ALTER TABLE public.home_ads
  DROP CONSTRAINT IF EXISTS home_ads_cta_action_check;

ALTER TABLE public.home_ads
  ADD CONSTRAINT home_ads_cta_action_check
  CHECK (cta_action IN ('bottom_sheet', 'share'));

ALTER TABLE public.home_ads
  ADD COLUMN IF NOT EXISTS sheet_title text;

ALTER TABLE public.home_ads
  ADD COLUMN IF NOT EXISTS sheet_body text;

COMMENT ON COLUMN public.home_ads.cta_action IS
  'share = open native share sheet with cta_url; bottom_sheet = show in-app sheet with sheet_title/sheet_body';
