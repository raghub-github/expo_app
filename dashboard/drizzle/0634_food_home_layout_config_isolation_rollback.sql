-- Rollback 0634: drop classic-only columns. Does not restore shared-column semantics.

SET statement_timeout = '30s';

ALTER TABLE public.cxapp_state_food_home_layout
  DROP COLUMN IF EXISTS classic_under_250_enabled,
  DROP COLUMN IF EXISTS classic_under_250_max_price,
  DROP COLUMN IF EXISTS classic_under_250_title,
  DROP COLUMN IF EXISTS classic_under_250_filter_label,
  DROP COLUMN IF EXISTS classic_under_250_tab_image_url,
  DROP COLUMN IF EXISTS classic_under_250_hero_image_url,
  DROP COLUMN IF EXISTS classic_hero_media;

COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_hero_media IS
  'Ordered hero slides for classic and grid_first food home layouts: [{ id, kind: image|video, url, sortOrder }].';

RESET statement_timeout;
