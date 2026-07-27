-- Rollback for 0456_rider_verify_projection_sync.sql
-- Enum values cannot be safely removed in Postgres; leave them in place.
-- This rollback does not wipe backfilled doc_number / pan_number (data-preserving).

SELECT 1;
