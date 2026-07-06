-- Grid-first "items under ₹250" section config + All tab image per store vertical.

CREATE TABLE IF NOT EXISTS public.user_app_category_meta (
  store_type store_type PRIMARY KEY,
  all_tab_label text NOT NULL DEFAULT 'All',
  all_tab_image_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_app_category_meta IS
  'Per vertical: All tab label/image shown first in customer app category rails.';

ALTER TABLE public.cxapp_state_food_home_layout
  ADD COLUMN IF NOT EXISTS grid_first_under_250_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS grid_first_under_250_max_price integer NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS grid_first_under_250_title text NOT NULL DEFAULT 'Items under ₹250',
  ADD COLUMN IF NOT EXISTS grid_first_under_250_filter_label text NOT NULL DEFAULT 'Meals under ₹250';

COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_under_250_enabled IS
  'When layout_key=grid_first, show horizontal items-under-price section on food home.';
COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_under_250_max_price IS
  'Max item selling_price (INR) for the under-250 section and filter chip.';
