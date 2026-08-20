-- Discovery-only Deals At inner-page hero. Independent of grid_first under-price hero.

ALTER TABLE public.cxapp_state_food_home_layout
  ADD COLUMN IF NOT EXISTS discovery_deals_at_hero_image_url text;

COMMENT ON COLUMN public.cxapp_state_food_home_layout.discovery_deals_at_hero_image_url IS
  'Hero banner for the Discovery Deals At inner page only. Grid-first uses grid_first_under_250_hero_image_url.';
