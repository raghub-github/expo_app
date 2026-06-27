-- Structured login location for rider device sessions (state / district / town / village).

ALTER TABLE public.user_device_sessions
  ADD COLUMN IF NOT EXISTS login_state TEXT NULL,
  ADD COLUMN IF NOT EXISTS login_district TEXT NULL,
  ADD COLUMN IF NOT EXISTS login_town TEXT NULL,
  ADD COLUMN IF NOT EXISTS login_village TEXT NULL;

COMMENT ON COLUMN public.user_device_sessions.login_state IS 'State/region at login (GPS or IP geo).';
COMMENT ON COLUMN public.user_device_sessions.login_district IS 'District at login when available.';
COMMENT ON COLUMN public.user_device_sessions.login_town IS 'Town or city at login.';
COMMENT ON COLUMN public.user_device_sessions.login_village IS 'Village or locality at login when available.';
