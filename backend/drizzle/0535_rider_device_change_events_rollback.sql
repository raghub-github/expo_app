-- Rollback for 0535_rider_device_change_events.sql

DROP INDEX IF EXISTS rider_device_change_events_rider_changed_idx;
DROP TABLE IF EXISTS public.rider_device_change_events;
