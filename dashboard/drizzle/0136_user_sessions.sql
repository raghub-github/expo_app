-- user_sessions: login/logout and live status per dashboard session
-- Enum may already exist if created manually
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_live_status') THEN
    CREATE TYPE public.user_live_status AS ENUM ('online', 'offline', 'break', 'emergency');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id BIGSERIAL NOT NULL,
  user_id BIGINT NOT NULL,
  login_time TIMESTAMP WITH TIME ZONE NOT NULL,
  logout_time TIMESTAMP WITH TIME ZONE NULL,
  current_status public.user_live_status NOT NULL DEFAULT 'online'::user_live_status,
  status_changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  work_seconds INTEGER NOT NULL DEFAULT 0,
  break_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT user_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.system_users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON public.user_sessions USING BTREE (user_id);
CREATE INDEX IF NOT EXISTS user_sessions_login_time_idx ON public.user_sessions USING BTREE (login_time);

DROP TRIGGER IF EXISTS user_sessions_updated_at_trigger ON public.user_sessions;
CREATE TRIGGER user_sessions_updated_at_trigger
  BEFORE UPDATE ON public.user_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
