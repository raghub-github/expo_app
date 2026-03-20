-- When a user marks offline, record when they went offline (separate from logout_time for clarity).
ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS offline_at TIMESTAMP WITH TIME ZONE NULL;
