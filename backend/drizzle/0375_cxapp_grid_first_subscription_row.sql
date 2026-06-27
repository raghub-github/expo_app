-- Per-state grid-first subscription promo strip: visibility + copy (managed from Super Admin CXApp Home).

ALTER TABLE public.cxapp_state_food_home_layout
  ADD COLUMN IF NOT EXISTS grid_first_subscription_row_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS grid_first_subscription_row_text text NOT NULL DEFAULT 'Subscribed users get free delivery on eligible orders within delivery range.';

COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_subscription_row_enabled IS
  'When true and layout_key is grid_first, customer app shows the gold subscription strip on food home.';

COMMENT ON COLUMN public.cxapp_state_food_home_layout.grid_first_subscription_row_text IS
  'Promo copy shown in the grid-first subscription strip for this state/UT.';
