-- 6b — explicit opt-in for the tracking watchdog to AUTO-CANCEL (unassign + penalise +
-- re-dispatch) a rider on a sustained pre-pickup breach. Default false: existing configs keep
-- warn-only behaviour until an admin turns this on. Detection/warnings are unchanged.
ALTER TABLE gm_rider_auto_cancel_config
  ADD COLUMN IF NOT EXISTS auto_cancel_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN gm_rider_auto_cancel_config.auto_cancel_enabled IS
  'When true, a sustained pre-pickup breach past grace_minutes auto-unassigns the rider, applies penalty_amount, and re-dispatches. When false, the watchdog only warns.';
