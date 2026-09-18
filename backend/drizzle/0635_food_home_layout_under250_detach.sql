-- Detach classic vs grid_first meals-under config so ₹99 (classic campaign)
-- never stays on grid_first_* columns after isolation.
--
-- I/O-safe / idempotent:
--   • ADD COLUMN IF NOT EXISTS only (no-op if 0634 already applied).
--   • Seed classic_* from grid_first_* only while classic_* is still defaults.
--   • Detach ₹99 campaign onto classic and reset grid ONLY when both sides
--     still share that campaign (re-run safe; won't wipe intentional grid=99
--     once classic already differs).
--   • Tiny table — short locks, no new indexes.
--   • statement_timeout 30s.

SET statement_timeout = '30s';

ALTER TABLE public.cxapp_state_food_home_layout
  ADD COLUMN IF NOT EXISTS classic_under_250_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS classic_under_250_max_price integer NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS classic_under_250_title text NOT NULL DEFAULT 'Items under ₹250',
  ADD COLUMN IF NOT EXISTS classic_under_250_filter_label text NOT NULL DEFAULT 'Meals under ₹250',
  ADD COLUMN IF NOT EXISTS classic_under_250_tab_image_url text,
  ADD COLUMN IF NOT EXISTS classic_under_250_hero_image_url text,
  ADD COLUMN IF NOT EXISTS classic_hero_media jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 1) One-time seed: copy shared/legacy grid values into classic_* while classic
--    is still at product defaults (preserves admin ₹99 that lived on grid_*).
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

-- 2) Detach classic ₹99 campaign from grid_first columns.
--    Only when classic already holds the same ₹99 values (seeded above or
--    previously), reset grid back to product defaults so grid home never
--    shows classic meals-under ₹99.
UPDATE public.cxapp_state_food_home_layout
SET
  grid_first_under_250_enabled = true,
  grid_first_under_250_max_price = 250,
  grid_first_under_250_title = 'Items under ₹250',
  grid_first_under_250_filter_label = 'Meals under ₹250',
  grid_first_under_250_tab_image_url = NULL,
  grid_first_under_250_hero_image_url = NULL,
  updated_at = now()
WHERE
  classic_under_250_max_price = 99
  AND grid_first_under_250_max_price = 99
  AND classic_under_250_title IS NOT DISTINCT FROM grid_first_under_250_title
  AND classic_under_250_filter_label IS NOT DISTINCT FROM grid_first_under_250_filter_label
  AND classic_under_250_tab_image_url IS NOT DISTINCT FROM grid_first_under_250_tab_image_url
  AND classic_under_250_hero_image_url IS NOT DISTINCT FROM grid_first_under_250_hero_image_url
  AND classic_under_250_enabled IS NOT DISTINCT FROM grid_first_under_250_enabled;

COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_under_250_enabled IS
  'GRID_FIRST ONLY. Never used when layout_key is classic or discovery.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_under_250_max_price IS
  'GRID_FIRST ONLY max price for meals-under tab / section.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.classic_under_250_enabled IS
  'CLASSIC ONLY. Horizontal meals-under section on classic food home.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.classic_under_250_max_price IS
  'CLASSIC ONLY max item price for meals-under section.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.discovery_deals_at_max_price IS
  'DISCOVERY ONLY. Never used for classic or grid_first meals-under.';

RESET statement_timeout;
