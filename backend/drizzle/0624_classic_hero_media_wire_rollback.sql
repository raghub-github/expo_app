-- Rollback 0624 comments / leave banner_video_url in place (additive column).
SET statement_timeout = '15s';

COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_hero_media IS
  'Ordered hero slides for grid_first layout: [{ id, kind: image|video, url, sortOrder }].';

COMMENT ON COLUMN public.merchant_stores.banner_video_url IS NULL;

RESET statement_timeout;
