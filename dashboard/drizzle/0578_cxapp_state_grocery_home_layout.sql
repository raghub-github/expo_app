-- Per-state / UT grocery home screen layout (CXApp Home admin).
-- Separate from food: own hero media + layout variant.

CREATE TABLE IF NOT EXISTS public.cxapp_state_grocery_home_layout (
  state_id uuid PRIMARY KEY REFERENCES public.states(id) ON DELETE CASCADE,
  layout_key public.cxapp_food_home_layout NOT NULL DEFAULT 'grid_first',
  grid_first_hero_media jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cxapp_state_grocery_home_layout_key_idx
  ON public.cxapp_state_grocery_home_layout (layout_key);

COMMENT ON TABLE public.cxapp_state_grocery_home_layout IS
  'CXApp Home: active grocery home UI variant + hero media per state/UT.';

COMMENT ON COLUMN public.cxapp_state_grocery_home_layout.grid_first_hero_media IS
  'Grocery grid_first hero carousel slides (images/videos).';
