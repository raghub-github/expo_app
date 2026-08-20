-- Dynamic Discovery CTA tiles (add/remove from Super Admin). Independent of grid-first.

ALTER TABLE public.cxapp_state_food_home_layout
  ADD COLUMN IF NOT EXISTS discovery_cta_tiles jsonb;

COMMENT ON COLUMN public.cxapp_state_food_home_layout.discovery_cta_tiles IS
  'Ordered Discovery home CTA tiles. NULL falls back to the three legacy Deals/Crazy/Packaging columns. [] hides the rail.';
