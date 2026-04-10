-- Busy time totals on profile + per-day busy minutes in agent_activity_logs (supervisor / reporting).

ALTER TABLE public.agent_profiles
  ADD COLUMN IF NOT EXISTS total_busy_time_minutes integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.agent_profiles.total_busy_time_minutes IS 'Lifetime total minutes spent in queue status busy (excluding current open segment until it ends).';

ALTER TABLE public.agent_activity_logs
  ADD COLUMN IF NOT EXISTS busy_time_minutes integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.agent_activity_logs.busy_time_minutes IS 'Minutes in busy status this UTC calendar day; working presence ≈ online_time_minutes + busy_time_minutes.';
