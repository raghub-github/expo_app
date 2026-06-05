-- Allow larger milestone geo-fence radii for testing / wide-area validation.
ALTER TABLE public.platform_rider_status_radius_rules
  DROP CONSTRAINT IF EXISTS platform_rider_status_radius_rules_meters_check;

ALTER TABLE public.platform_rider_status_radius_rules
  ADD CONSTRAINT platform_rider_status_radius_rules_meters_check
  CHECK (radius_meters > 0 AND radius_meters <= 100000);
