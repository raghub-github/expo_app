-- Rider device session tracker: richer metadata + audit fields for multi-device login control.

ALTER TABLE public.user_device_sessions
  ADD COLUMN IF NOT EXISTS rider_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS app_version TEXT NULL,
  ADD COLUMN IF NOT EXISTS device_model TEXT NULL,
  ADD COLUMN IF NOT EXISTS os_version TEXT NULL,
  ADD COLUMN IF NOT EXISTS logged_out_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS revoked_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS revoke_reason TEXT NULL;

UPDATE public.user_device_sessions
SET rider_id = (regexp_match(user_id, '^usr_(\d+)$'))[1]::INTEGER
WHERE rider_id IS NULL
  AND user_id ~ '^usr_\d+$';

CREATE INDEX IF NOT EXISTS user_device_sessions_rider_active_idx
  ON public.user_device_sessions USING btree (rider_id)
  WHERE is_active = TRUE AND rider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_device_sessions_rider_id_idx
  ON public.user_device_sessions USING btree (rider_id)
  WHERE rider_id IS NOT NULL;

COMMENT ON COLUMN public.user_device_sessions.rider_id IS 'Denormalized riders.id for dashboard session queries (user_id = usr_{rider_id}).';
COMMENT ON COLUMN public.user_device_sessions.revoked_by IS 'rider_self | rider_logout_all | admin:{system_user_id}';
COMMENT ON COLUMN public.user_device_sessions.logged_out_at IS 'When this device session was deactivated.';
