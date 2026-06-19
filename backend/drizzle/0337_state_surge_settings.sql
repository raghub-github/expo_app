-- Per-state cap on total rider surge per order.

CREATE TABLE IF NOT EXISTS state_surge_settings (
  state_id uuid PRIMARY KEY,
  max_total_surge_amount numeric(12, 2) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT state_surge_settings_state_fk FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE CASCADE,
  CONSTRAINT state_surge_settings_max_nonneg CHECK (
    max_total_surge_amount IS NULL OR max_total_surge_amount >= 0
  )
);

CREATE INDEX IF NOT EXISTS state_surge_settings_state_idx ON state_surge_settings (state_id);
