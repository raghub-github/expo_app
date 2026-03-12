-- User-level device sessions across parent/child stores.

CREATE TABLE IF NOT EXISTS public.user_device_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  parent_store_id BIGINT NULL,
  child_store_id BIGINT NULL,
  device_type TEXT,
  device_name TEXT,
  os TEXT,
  ip_address TEXT,
  location TEXT,
  login_method TEXT,
  login_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS user_device_sessions_user_id_idx
  ON public.user_device_sessions USING btree (user_id);

CREATE INDEX IF NOT EXISTS user_device_sessions_user_active_idx
  ON public.user_device_sessions USING btree (user_id)
  WHERE is_active = TRUE;

