ALTER TABLE public.home_ads DROP CONSTRAINT IF EXISTS home_ads_cta_action_check;
ALTER TABLE public.home_ads DROP COLUMN IF EXISTS sheet_body;
ALTER TABLE public.home_ads DROP COLUMN IF EXISTS sheet_title;
ALTER TABLE public.home_ads DROP COLUMN IF EXISTS cta_action;
