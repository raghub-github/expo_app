-- 0618: Allow duty_update / system_backfill on riders.location_source.
-- Fixes PUT /v1/rider/home-location 500 when Duty ON sheet saves working location.
-- Idempotent: drop + recreate check constraint.

ALTER TABLE public.riders DROP CONSTRAINT IF EXISTS riders_location_source_check;

ALTER TABLE public.riders
  ADD CONSTRAINT riders_location_source_check
  CHECK (
    location_source IS NULL
    OR location_source IN (
      'gps_auto',
      'manual_select',
      'manual_other',
      'duty_update',
      'system_backfill'
    )
  );

COMMENT ON CONSTRAINT riders_location_source_check ON public.riders IS
  'Working-location source on riders.*; duty_update used when Duty ON mismatch sheet updates working location.';
