-- Device GPS capture time on rider live location cache.
-- Nullable: legacy / duty-toggle writes without a device fix leave it NULL;
-- freshness then falls back to updated_at (server receive).
ALTER TABLE public.rider_current_locations
  ADD COLUMN IF NOT EXISTS gps_captured_at timestamptz;

COMMENT ON COLUMN public.rider_current_locations.gps_captured_at IS
  'Device GPS fix time (tsMs). Age/freshness use COALESCE(gps_captured_at, updated_at); updated_at remains server receive.';
