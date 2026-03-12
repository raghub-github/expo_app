-- Store staff accounts (managed by merchant owners) and device sessions.

CREATE TABLE IF NOT EXISTS public.store_staff (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  role TEXT NOT NULL,
  status BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_staff_store_id_idx
  ON public.store_staff USING btree (store_id);

CREATE INDEX IF NOT EXISTS store_staff_active_idx
  ON public.store_staff USING btree (store_id)
  WHERE status = TRUE;

-- Active login sessions per store + staff.
CREATE TABLE IF NOT EXISTS public.store_sessions (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  staff_id BIGINT NULL REFERENCES store_staff(id) ON DELETE SET NULL,
  device_type TEXT,
  device_name TEXT,
  ip_address TEXT,
  location TEXT,
  login_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS store_sessions_store_id_idx
  ON public.store_sessions USING btree (store_id);

CREATE INDEX IF NOT EXISTS store_sessions_active_idx
  ON public.store_sessions USING btree (store_id)
  WHERE is_active = TRUE;

