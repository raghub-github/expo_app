-- Discovery home CTA tiles: Deals At amount, labels, and per-tile images.

ALTER TABLE public.cxapp_state_food_home_layout
  ADD COLUMN IF NOT EXISTS discovery_deals_at_max_price integer,
  ADD COLUMN IF NOT EXISTS discovery_deals_at_image_url text,
  ADD COLUMN IF NOT EXISTS discovery_crazy_deals_image_url text,
  ADD COLUMN IF NOT EXISTS discovery_free_packaging_image_url text,
  ADD COLUMN IF NOT EXISTS discovery_deals_at_label text,
  ADD COLUMN IF NOT EXISTS discovery_crazy_deals_label text,
  ADD COLUMN IF NOT EXISTS discovery_free_packaging_label text;

COMMENT ON COLUMN public.cxapp_state_food_home_layout.discovery_deals_at_max_price IS
  'Discovery "Deals At ₹X" max item price. NULL falls back to grid-first under-price amount.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.discovery_deals_at_image_url IS
  'Image for the discovery Deals At CTA tile.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.discovery_crazy_deals_image_url IS
  'Image for the discovery Crazy Deals CTA tile.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.discovery_free_packaging_image_url IS
  'Image for the discovery Free Packaging CTA tile.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.discovery_deals_at_label IS
  'Optional Deals At tile title. NULL uses DEALS AT ₹{price}.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.discovery_crazy_deals_label IS
  'Optional Crazy Deals tile title. NULL uses CRAZY DEALS.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.discovery_free_packaging_label IS
  'Optional Free Packaging tile title. NULL uses FREE PACKAGING.';
