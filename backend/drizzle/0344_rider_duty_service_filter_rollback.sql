-- Rollback for 0344_rider_duty_service_filter.sql
-- NOTE: Data backfills (vehicle_category, stripped food, corrective duty rows) are NOT reversed.
-- This only drops indexes/comments added by 0344. Columns are left in place (safe for running app).

BEGIN;

DROP INDEX IF EXISTS duty_logs_vehicle_id_idx;

COMMENT ON COLUMN duty_logs.service_types IS NULL;

COMMIT;
