-- Per-state / UT food delivery home screen layout (CXApp Home admin).
-- Exactly one active layout per state (PK on state_id).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cxapp_food_home_layout') THEN
    CREATE TYPE public.cxapp_food_home_layout AS ENUM ('classic', 'grid_first', 'discovery');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.cxapp_state_food_home_layout (
  state_id uuid PRIMARY KEY REFERENCES public.states(id) ON DELETE CASCADE,
  layout_key public.cxapp_food_home_layout NOT NULL DEFAULT 'classic',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cxapp_state_food_home_layout_key_idx
  ON public.cxapp_state_food_home_layout (layout_key);

COMMENT ON TABLE public.cxapp_state_food_home_layout IS
  'CXApp Home: active food delivery home UI variant per state/UT (classic | grid_first | discovery).';

COMMENT ON COLUMN public.cxapp_state_food_home_layout.layout_key IS
  'Only one row per state; this is the active customer-app food home layout for that state.';
