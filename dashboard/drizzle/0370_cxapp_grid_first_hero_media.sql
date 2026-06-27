-- Grid-first food home hero carousel — per-state admin uploads (images / MP4).
-- Stored as JSON array of { id, kind, url, sortOrder } with R2 proxy URLs.

ALTER TABLE public.cxapp_state_food_home_layout
  ADD COLUMN IF NOT EXISTS grid_first_hero_media jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_hero_media IS
  'Ordered hero slides for grid_first layout: [{ id, kind: image|video, url, sortOrder }].';
