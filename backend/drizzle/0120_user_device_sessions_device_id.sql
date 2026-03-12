-- Add device_id column for per-device session control.

ALTER TABLE public.user_device_sessions
  ADD COLUMN IF NOT EXISTS device_id TEXT;

CREATE INDEX IF NOT EXISTS user_device_sessions_user_device_active_idx
  ON public.user_device_sessions USING btree (user_id, device_id)
  WHERE is_active = TRUE;

