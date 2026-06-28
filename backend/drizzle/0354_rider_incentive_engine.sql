-- GatiMitra Rider Incentive Engine (V1)
-- New program tables; legacy rider_incentives / rider_incentive_participation remain unchanged.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.incentive_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NULL,

  service text NOT NULL,
  vehicle_type text NULL,

  status text NOT NULL DEFAULT 'draft',
  -- draft / active / paused / archived

  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',

  recurrence_type text NOT NULL DEFAULT 'one_time',
  -- one_time / daily / weekly / monthly

  slot_mode text NOT NULL DEFAULT 'all_day',
  -- all_day / custom_slots

  slot_day_mode text NOT NULL DEFAULT 'full_week',
  -- full_week / weekdays / weekends / specific_days

  active_days jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- when slot_day_mode = specific_days: [0..6] day_of_week ints

  geo_scope_mode text NOT NULL DEFAULT 'selected_states',
  -- selected_states / all_india / selected_cities / selected_zones

  visibility_mode text NOT NULL DEFAULT 'scoped_visible',
  -- scoped_visible / eligible_only

  requires_gmitra_max boolean NOT NULL DEFAULT true,
  show_to_non_subscribers boolean NOT NULL DEFAULT true,
  show_before_eligible boolean NOT NULL DEFAULT true,

  reward_type text NOT NULL,
  -- flat / tier / rank / pool / streak

  payout_mode text NOT NULL DEFAULT 'manual_approve',
  -- instant / next_settlement / manual_approve

  payout_cap_mode text NOT NULL DEFAULT 'top_n',
  -- all_eligible / top_n / top_percent / first_n / pool_limit

  max_winners integer NULL,
  max_total_payout numeric(12, 2) NULL,
  max_payout_per_rider numeric(12, 2) NULL,
  stop_on_budget_exhaust boolean NOT NULL DEFAULT false,

  sort_basis text NULL,
  tie_breaker text NULL,

  is_active boolean NOT NULL DEFAULT false,
  is_paused boolean NOT NULL DEFAULT false,

  created_by integer NULL,
  updated_by integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT incentive_programs_status_chk
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  CONSTRAINT incentive_programs_recurrence_chk
    CHECK (recurrence_type IN ('one_time', 'daily', 'weekly', 'monthly')),
  CONSTRAINT incentive_programs_slot_mode_chk
    CHECK (slot_mode IN ('all_day', 'custom_slots')),
  CONSTRAINT incentive_programs_slot_day_mode_chk
    CHECK (slot_day_mode IN ('full_week', 'weekdays', 'weekends', 'specific_days')),
  CONSTRAINT incentive_programs_geo_scope_chk
    CHECK (geo_scope_mode IN ('selected_states', 'all_india', 'selected_cities', 'selected_zones')),
  CONSTRAINT incentive_programs_visibility_chk
    CHECK (visibility_mode IN ('scoped_visible', 'eligible_only')),
  CONSTRAINT incentive_programs_reward_type_chk
    CHECK (reward_type IN ('flat', 'tier', 'rank', 'pool', 'streak')),
  CONSTRAINT incentive_programs_payout_mode_chk
    CHECK (payout_mode IN ('instant', 'next_settlement', 'manual_approve')),
  CONSTRAINT incentive_programs_payout_cap_chk
    CHECK (payout_cap_mode IN ('all_eligible', 'top_n', 'top_percent', 'first_n', 'pool_limit'))
);

CREATE INDEX IF NOT EXISTS incentive_programs_service_status_idx
  ON public.incentive_programs (service, status);

CREATE INDEX IF NOT EXISTS incentive_programs_active_dates_idx
  ON public.incentive_programs (is_active, start_at, end_at);

COMMENT ON TABLE public.incentive_programs IS
  'Rider incentive programs (state-scoped, GMitra Max gated). Distinct from billing_platform_offers and legacy rider_incentives.';

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.incentive_program_geo_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.incentive_programs(id) ON DELETE CASCADE,

  scope_type text NOT NULL,
  -- state / ut / city / zone / all_india

  state_id uuid NULL REFERENCES public.states(id) ON DELETE CASCADE,
  city_id uuid NULL,
  zone_id uuid NULL,

  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT incentive_program_geo_scopes_type_chk
    CHECK (scope_type IN ('state', 'ut', 'city', 'zone', 'all_india'))
);

CREATE INDEX IF NOT EXISTS incentive_program_geo_scopes_program_idx
  ON public.incentive_program_geo_scopes (program_id);

CREATE INDEX IF NOT EXISTS incentive_program_geo_scopes_state_idx
  ON public.incentive_program_geo_scopes (state_id);

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.incentive_program_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL UNIQUE REFERENCES public.incentive_programs(id) ON DELETE CASCADE,

  min_completed_orders integer NULL,
  min_accepted_orders integer NULL,
  min_active_minutes integer NULL,

  min_acceptance_rate numeric(5, 2) NULL,
  max_cancellation_rate numeric(5, 2) NULL,
  min_customer_rating numeric(3, 2) NULL,

  min_login_days integer NULL,
  min_peak_slot_orders integer NULL,

  max_fraud_score integer NULL DEFAULT 0,

  exclude_suspended_riders boolean NOT NULL DEFAULT true,
  exclude_low_rating_riders boolean NOT NULL DEFAULT false,
  exclude_if_any_fraud_flag boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.incentive_program_time_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.incentive_programs(id) ON DELETE CASCADE,

  day_of_week integer NULL,
  -- 0 sunday … 6 saturday; null = every day

  start_time time NOT NULL,
  end_time time NOT NULL,

  label text NULL,
  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT incentive_program_time_windows_dow_chk
    CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6))
);

CREATE INDEX IF NOT EXISTS incentive_program_time_windows_program_idx
  ON public.incentive_program_time_windows (program_id);

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.incentive_program_reward_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.incentive_programs(id) ON DELETE CASCADE,

  tier_no integer NOT NULL,
  tier_type text NOT NULL,
  -- flat / trip_threshold / rank_range

  min_orders integer NULL,
  max_orders integer NULL,

  rank_from integer NULL,
  rank_to integer NULL,

  reward_amount numeric(12, 2) NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT incentive_program_reward_tiers_type_chk
    CHECK (tier_type IN ('flat', 'trip_threshold', 'rank_range'))
);

CREATE INDEX IF NOT EXISTS incentive_program_reward_tiers_program_idx
  ON public.incentive_program_reward_tiers (program_id, tier_no);

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rider_incentive_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  program_id uuid NOT NULL REFERENCES public.incentive_programs(id) ON DELETE CASCADE,
  rider_user_id text NOT NULL,
  rider_id integer NULL REFERENCES public.riders(id) ON DELETE SET NULL,

  state_id uuid NULL REFERENCES public.states(id) ON DELETE SET NULL,
  service text NOT NULL,

  cycle_start_at timestamptz NOT NULL,
  cycle_end_at timestamptz NOT NULL,

  completed_orders integer NOT NULL DEFAULT 0,
  accepted_orders integer NOT NULL DEFAULT 0,
  cancelled_orders integer NOT NULL DEFAULT 0,
  active_minutes integer NOT NULL DEFAULT 0,

  gross_earnings numeric(12, 2) NOT NULL DEFAULT 0,
  acceptance_rate numeric(5, 2) NULL,
  cancellation_rate numeric(5, 2) NULL,
  customer_rating numeric(3, 2) NULL,

  fraud_score integer NOT NULL DEFAULT 0,
  fraud_flags jsonb NOT NULL DEFAULT '[]'::jsonb,

  visible boolean NOT NULL DEFAULT false,
  base_eligible boolean NOT NULL DEFAULT false,
  rank_eligible boolean NOT NULL DEFAULT false,
  winner_selected boolean NOT NULL DEFAULT false,
  disqualified boolean NOT NULL DEFAULT false,

  rider_status text NOT NULL DEFAULT 'NOT_ELIGIBLE_YET',
  -- LOCKED_SUBSCRIPTION / NOT_ELIGIBLE_YET / IN_PROGRESS / ELIGIBLE / WINNER_SELECTED / REWARD_EARNED / DISQUALIFIED

  projected_reward numeric(12, 2) NULL,
  final_reward numeric(12, 2) NULL,

  rank_position integer NULL,
  payout_status text NULL,
  -- pending / approved / credited / rejected

  last_evaluated_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rider_incentive_progress_status_chk
    CHECK (rider_status IN (
      'LOCKED_SUBSCRIPTION',
      'NOT_ELIGIBLE_YET',
      'IN_PROGRESS',
      'ELIGIBLE',
      'WINNER_SELECTED',
      'REWARD_EARNED',
      'DISQUALIFIED'
    )),
  CONSTRAINT rider_incentive_progress_payout_status_chk
    CHECK (payout_status IS NULL OR payout_status IN ('pending', 'approved', 'credited', 'rejected')),
  CONSTRAINT rider_incentive_progress_cycle_uniq
    UNIQUE (program_id, rider_user_id, cycle_start_at, cycle_end_at)
);

CREATE INDEX IF NOT EXISTS rider_incentive_progress_program_idx
  ON public.rider_incentive_progress (program_id);

CREATE INDEX IF NOT EXISTS rider_incentive_progress_rider_idx
  ON public.rider_incentive_progress (rider_user_id);

CREATE INDEX IF NOT EXISTS rider_incentive_progress_program_rider_idx
  ON public.rider_incentive_progress (program_id, rider_user_id);

CREATE INDEX IF NOT EXISTS rider_incentive_progress_rider_id_idx
  ON public.rider_incentive_progress (rider_id);

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.incentive_reward_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.incentive_programs(id),
  rider_user_id text NOT NULL,
  rider_progress_id uuid NULL REFERENCES public.rider_incentive_progress(id) ON DELETE SET NULL,

  reward_amount numeric(12, 2) NOT NULL,
  reward_status text NOT NULL DEFAULT 'pending',
  -- pending / approved / credited / rejected / reversed

  approval_note text NULL,
  credited_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT incentive_reward_ledger_status_chk
    CHECK (reward_status IN ('pending', 'approved', 'credited', 'rejected', 'reversed'))
);

CREATE INDEX IF NOT EXISTS incentive_reward_ledger_program_idx
  ON public.incentive_reward_ledger (program_id);

CREATE INDEX IF NOT EXISTS incentive_reward_ledger_rider_idx
  ON public.incentive_reward_ledger (rider_user_id);

CREATE INDEX IF NOT EXISTS incentive_reward_ledger_status_idx
  ON public.incentive_reward_ledger (reward_status);
