-- Grid-first "items under price": category tab image + inner page hero image.

ALTER TABLE public.cxapp_state_food_home_layout
  ADD COLUMN IF NOT EXISTS grid_first_under_250_tab_image_url text,
  ADD COLUMN IF NOT EXISTS grid_first_under_250_hero_image_url text;

COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_under_250_tab_image_url IS
  'Image for the meals-under-price tab on grid-first home category row.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_under_250_hero_image_url IS
  'Hero banner image on the dedicated meals-under-price page.';
