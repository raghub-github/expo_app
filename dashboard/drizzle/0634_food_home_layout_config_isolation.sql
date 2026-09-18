-- Isolate classic / grid_first / discovery food-home config so they never share
-- under-price or hero media columns (fixes classic ₹99 leaking into grid, etc.).
--
-- I/O-safe / idempotent:
--   • ADD COLUMN IF NOT EXISTS only.
--   • One-time backfill ONLY when classic_* is still at defaults and source has data
--     (no rewrite of already-customized classic rows).
--   • Tiny table (1 row per state/UT) — no long locks, no new indexes.
--   • COMMENT updates only for semantics.
--   • statement_timeout budget 30s.

SET statement_timeout = '30s';

ALTER TABLE public.cxapp_state_food_home_layout
  ADD COLUMN IF NOT EXISTS classic_under_250_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS classic_under_250_max_price integer NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS classic_under_250_title text NOT NULL DEFAULT 'Items under ₹250',
  ADD COLUMN IF NOT EXISTS classic_under_250_filter_label text NOT NULL DEFAULT 'Meals under ₹250',
  ADD COLUMN IF NOT EXISTS classic_under_250_tab_image_url text,
  ADD COLUMN IF NOT EXISTS classic_under_250_hero_image_url text,
  ADD COLUMN IF NOT EXISTS classic_hero_media jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Seed classic_* from the previously shared grid_first_* values once, so existing
-- admin config is not lost. Skip rows already customized on classic_*.
UPDATE public.cxapp_state_food_home_layout
SET
  classic_under_250_enabled = grid_first_under_250_enabled,
  classic_under_250_max_price = grid_first_under_250_max_price,
  classic_under_250_title = grid_first_under_250_title,
  classic_under_250_filter_label = grid_first_under_250_filter_label,
  classic_under_250_tab_image_url = grid_first_under_250_tab_image_url,
  classic_under_250_hero_image_url = grid_first_under_250_hero_image_url,
  updated_at = now()
WHERE
  classic_under_250_max_price = 250
  AND classic_under_250_title = 'Items under ₹250'
  AND classic_under_250_filter_label = 'Meals under ₹250'
  AND classic_under_250_tab_image_url IS NULL
  AND classic_under_250_hero_image_url IS NULL
  AND (
    grid_first_under_250_max_price IS DISTINCT FROM 250
    OR grid_first_under_250_title IS DISTINCT FROM 'Items under ₹250'
    OR grid_first_under_250_filter_label IS DISTINCT FROM 'Meals under ₹250'
    OR grid_first_under_250_tab_image_url IS NOT NULL
    OR grid_first_under_250_hero_image_url IS NOT NULL
    OR grid_first_under_250_enabled IS DISTINCT FROM true
  );

UPDATE public.cxapp_state_food_home_layout
SET
  classic_hero_media = grid_first_hero_media,
  updated_at = now()
WHERE
  (classic_hero_media IS NULL OR classic_hero_media = '[]'::jsonb)
  AND grid_first_hero_media IS NOT NULL
  AND grid_first_hero_media <> '[]'::jsonb;

COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_under_250_enabled IS
  'GRID_FIRST ONLY. Never used when layout_key is classic or discovery.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_under_250_max_price IS
  'GRID_FIRST ONLY max price for meals-under tab / section.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_under_250_title IS
  'GRID_FIRST ONLY title for meals-under section.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_under_250_filter_label IS
  'GRID_FIRST ONLY label for meals-under category tab.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_under_250_tab_image_url IS
  'GRID_FIRST ONLY tab artwork for meals-under.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_under_250_hero_image_url IS
  'GRID_FIRST ONLY hero for meals-under inner page.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_hero_media IS
  'GRID_FIRST ONLY ordered hero slides: [{ id, kind: image|video, url, sortOrder }].';

COMMENT ON COLUMN public.cxapp_state_food_home_layout.classic_under_250_enabled IS
  'CLASSIC ONLY. Horizontal meals-under section on classic food home.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.classic_under_250_max_price IS
  'CLASSIC ONLY max item price for meals-under section.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.classic_under_250_title IS
  'CLASSIC ONLY meals-under section title.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.classic_under_250_filter_label IS
  'CLASSIC ONLY meals-under label (see-all / filter copy).';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.classic_under_250_tab_image_url IS
  'CLASSIC ONLY optional meals-under artwork.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.classic_under_250_hero_image_url IS
  'CLASSIC ONLY hero for meals-under inner page.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.classic_hero_media IS
  'CLASSIC ONLY ordered hero slides (isolated from grid_first_hero_media).';

COMMENT ON COLUMN public.cxapp_state_food_home_layout.discovery_deals_at_max_price IS
  'DISCOVERY ONLY. Never used for classic or grid_first meals-under.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.discovery_cta_tiles IS
  'DISCOVERY ONLY promo CTA tiles.';

RESET statement_timeout;
