-- Rollback 0617 (safe drop of new objects only — does not wipe riders working location columns).
DROP INDEX IF EXISTS public.rider_working_location_history_current_uq;
DROP INDEX IF EXISTS public.rider_working_location_history_rider_changed_idx;
DROP TABLE IF EXISTS public.rider_working_location_history;

ALTER TABLE public.riders
  DROP COLUMN IF EXISTS registered_city,
  DROP COLUMN IF EXISTS registered_state,
  DROP COLUMN IF EXISTS registered_region,
  DROP COLUMN IF EXISTS registered_district,
  DROP COLUMN IF EXISTS registered_pincode,
  DROP COLUMN IF EXISTS registered_address,
  DROP COLUMN IF EXISTS registered_lat,
  DROP COLUMN IF EXISTS registered_lon,
  DROP COLUMN IF EXISTS registered_state_id,
  DROP COLUMN IF EXISTS registered_region_id,
  DROP COLUMN IF EXISTS registered_district_id;
