-- Per-state ride vehicle max distance + state-scoped surge configuration.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'state_surge_type') THEN
    CREATE TYPE state_surge_type AS ENUM ('fixed', 'percentage');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'state_surge_vehicle_scope') THEN
    CREATE TYPE state_surge_vehicle_scope AS ENUM (
      'all',
      '2_wheeler',
      '3_wheeler',
      '4_wheeler_non_ac',
      '4_wheeler_ac'
    );
  END IF;
END
$$;

-- ─── Vehicle max ride distance per state ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS ride_vehicle_limits (
  id bigserial PRIMARY KEY,
  state_id uuid NOT NULL,
  vehicle_type ride_vehicle_pricing_type NOT NULL,
  max_distance_km numeric(10, 2) NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ride_vehicle_limits_state_fk FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE CASCADE,
  CONSTRAINT ride_vehicle_limits_max_positive CHECK (max_distance_km > 0),
  CONSTRAINT ride_vehicle_limits_state_vehicle_uniq UNIQUE (state_id, vehicle_type)
);

CREATE INDEX IF NOT EXISTS ride_vehicle_limits_state_idx
  ON ride_vehicle_limits (state_id, is_enabled);

CREATE INDEX IF NOT EXISTS ride_vehicle_limits_vehicle_idx
  ON ride_vehicle_limits (vehicle_type);

-- ─── State-wise surge configs ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS state_surge_configs (
  id bigserial PRIMARY KEY,
  state_id uuid NOT NULL,
  name text NOT NULL,
  description text NULL,
  enabled boolean NOT NULL DEFAULT true,
  surge_type state_surge_type NOT NULL DEFAULT 'fixed',
  amount numeric(14, 4) NOT NULL DEFAULT 0,
  vehicle_type state_surge_vehicle_scope NOT NULL DEFAULT 'all',
  max_riders_only boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  manual_active boolean NOT NULL DEFAULT false,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT state_surge_configs_state_fk FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE CASCADE,
  CONSTRAINT state_surge_configs_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT state_surge_configs_amount_nonneg CHECK (amount >= 0),
  CONSTRAINT state_surge_configs_priority_nonneg CHECK (priority >= 0),
  CONSTRAINT state_surge_configs_pct_max CHECK (
    surge_type <> 'percentage' OR amount <= 100
  )
);

CREATE INDEX IF NOT EXISTS state_surge_configs_state_enabled_idx
  ON state_surge_configs (state_id, enabled, priority DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS state_surge_configs_state_priority_idx
  ON state_surge_configs (state_id, priority DESC, id ASC)
  WHERE deleted_at IS NULL AND enabled = true;

-- Peak-hour windows per state surge (optional)
CREATE TABLE IF NOT EXISTS state_surge_time_slots (
  id bigserial PRIMARY KEY,
  state_surge_id bigint NOT NULL REFERENCES state_surge_configs(id) ON DELETE CASCADE,
  start_time time NOT NULL,
  end_time time NOT NULL,
  days_of_week smallint[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6],
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT state_surge_time_slots_days_valid CHECK (
    cardinality(days_of_week) > 0
    AND days_of_week <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
  )
);

CREATE INDEX IF NOT EXISTS state_surge_time_slots_surge_idx
  ON state_surge_time_slots (state_surge_id, is_enabled);
