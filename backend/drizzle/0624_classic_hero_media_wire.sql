-- Classic + grid_first food home share the same hero carousel column.
-- Store inner classic/grid_first immersive hero uses merchant_stores.banner_video_url.
--
-- I/O-safe / idempotent:
--   • ADD COLUMN IF NOT EXISTS only (metadata when already present).
--   • COMMENT updates only — no backfill, no rewrite, no new indexes.
--   • statement_timeout budget 15s.

SET statement_timeout = '15s';

ALTER TABLE public.merchant_stores
  ADD COLUMN IF NOT EXISTS banner_video_url TEXT;

COMMENT ON COLUMN public.merchant_stores.banner_video_url IS
  'Optional admin-uploaded MP4 for store inner-page hero (classic / grid_first). banner_url is poster/fallback.';

COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_hero_media IS
  'Ordered hero slides for classic and grid_first food home layouts: [{ id, kind: image|video, url, sortOrder }].';

RESET statement_timeout;
