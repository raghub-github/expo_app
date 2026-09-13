-- Rollback 0618: restore original 0615 location_source check (no duty_update).

ALTER TABLE public.riders DROP CONSTRAINT IF EXISTS riders_location_source_check;

ALTER TABLE public.riders
  ADD CONSTRAINT riders_location_source_check
  CHECK (
    location_source IS NULL
    OR location_source IN ('gps_auto', 'manual_select', 'manual_other')
  );
