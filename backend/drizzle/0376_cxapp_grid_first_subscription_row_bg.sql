-- Per-state grid-first subscription row background color (Super Admin CXApp Home).

ALTER TABLE public.cxapp_state_food_home_layout
  ADD COLUMN IF NOT EXISTS grid_first_subscription_row_bg_color text NOT NULL DEFAULT '#FFF4E8';

COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_subscription_row_bg_color IS
  'Hex background for grid-first subscription promo strip (e.g. #FFF4E8).';
