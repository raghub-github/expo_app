-- Home Ads: add redirect CTA action (in-app / deep-link open on button tap).
ALTER TABLE public.home_ads
  DROP CONSTRAINT IF EXISTS home_ads_cta_action_check;

ALTER TABLE public.home_ads
  ADD CONSTRAINT home_ads_cta_action_check
  CHECK (cta_action IN ('bottom_sheet', 'share', 'redirect'));

COMMENT ON COLUMN public.home_ads.cta_action IS
  'share = native share sheet; bottom_sheet = in-app sheet; redirect = open cta_url (in-app path or https) on CTA tap';
