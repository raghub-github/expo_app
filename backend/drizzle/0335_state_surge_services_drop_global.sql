-- State surge: per-service enable flags. Drop legacy global surge catalog.

ALTER TABLE state_surge_configs
  ADD COLUMN IF NOT EXISTS applies_food boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS applies_parcel boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS applies_ride boolean NOT NULL DEFAULT true;

ALTER TABLE state_surge_configs
  ADD CONSTRAINT state_surge_configs_service_required CHECK (
    applies_food OR applies_parcel OR applies_ride
  );

CREATE INDEX IF NOT EXISTS state_surge_configs_state_service_idx
  ON state_surge_configs (state_id, enabled, applies_food, applies_parcel, applies_ride)
  WHERE deleted_at IS NULL;

-- Global surge catalog replaced by per-state state_surge_configs
DROP TABLE IF EXISTS surge_time_slots CASCADE;
DROP TABLE IF EXISTS surge_definitions CASCADE;
