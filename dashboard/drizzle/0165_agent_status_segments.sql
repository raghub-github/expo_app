-- Granular agent presence: completed status intervals + unified "since" marker on profile.

ALTER TABLE public.agent_profiles
  ADD COLUMN IF NOT EXISTS current_status_since timestamptz;

UPDATE public.agent_profiles
SET current_status_since = COALESCE(
  CASE LOWER(TRIM(COALESCE(current_status::text, '')))
    WHEN 'online' THEN last_online_at
    WHEN 'break' THEN break_started_at
    WHEN 'busy' THEN busy_started_at
    ELSE last_activity_at
  END,
  last_activity_at,
  updated_at,
  created_at,
  now()
)
WHERE current_status_since IS NULL;

ALTER TABLE public.agent_profiles
  ALTER COLUMN current_status_since SET DEFAULT now();

ALTER TABLE public.agent_profiles
  ALTER COLUMN current_status_since SET NOT NULL;

COMMENT ON COLUMN public.agent_profiles.current_status_since IS 'When the agent entered the current current_status; used to close the previous interval on the next transition.';

CREATE TABLE IF NOT EXISTS public.agent_status_segments (
  id bigserial PRIMARY KEY,
  agent_user_id bigint NOT NULL REFERENCES public.system_users (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (
    status = ANY (ARRAY['online'::text, 'offline'::text, 'break'::text, 'busy'::text])
  ),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  reason text,
  change_source text,
  changed_by_user_id bigint REFERENCES public.system_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_status_segments_time_check CHECK (ended_at > started_at)
);

CREATE INDEX IF NOT EXISTS idx_agent_status_segments_agent_started
  ON public.agent_status_segments (agent_user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_status_segments_agent_ended
  ON public.agent_status_segments (agent_user_id, ended_at DESC);

COMMENT ON TABLE public.agent_status_segments IS 'Completed time-in-status intervals; one row is appended when an agent leaves a status (mirror of rollups into agent_activity_logs).';
