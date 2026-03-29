-- Agent work sessions (supervisor-friendly shifts), auto-assign capacity, assignment audit,
-- and richer availability logs (who changed status).

-- 1) Global cap: max open (non-terminal) tickets per agent for queue auto-assignment
CREATE TABLE IF NOT EXISTS public.ticket_queue_auto_assign_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  max_open_tickets_per_agent integer NOT NULL DEFAULT 6,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_queue_auto_assign_settings_singleton CHECK (id = 1)
);

INSERT INTO public.ticket_queue_auto_assign_settings (id, max_open_tickets_per_agent)
VALUES (1, 6)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.ticket_queue_auto_assign_settings IS 'Singleton (id=1): global max concurrent open tickets per agent for queue auto-assignment.';

-- 2) Work session: opened when agent goes online from offline; closed on offline (self or supervisor)
CREATE TABLE IF NOT EXISTS public.agent_work_sessions (
  id bigserial PRIMARY KEY,
  agent_user_id bigint NOT NULL REFERENCES public.system_users (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_by_user_id bigint REFERENCES public.system_users (id) ON DELETE SET NULL,
  end_source text CHECK (end_source IS NULL OR end_source IN ('self_offline', 'supervisor_offline')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_work_sessions_agent_started
  ON public.agent_work_sessions (agent_user_id, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_work_sessions_one_open
  ON public.agent_work_sessions (agent_user_id)
  WHERE ended_at IS NULL;

COMMENT ON TABLE public.agent_work_sessions IS 'One open row per agent while in an online shift; closed on offline (self or supervisor).';

-- 3) Assignment history (auto + optional manual via same table later)
CREATE TABLE IF NOT EXISTS public.ticket_assignment_history (
  id bigserial PRIMARY KEY,
  ticket_id bigint NOT NULL REFERENCES public.unified_tickets (id) ON DELETE CASCADE,
  agent_user_id bigint NOT NULL REFERENCES public.system_users (id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assignment_type text NOT NULL DEFAULT 'auto_balance'
    CHECK (assignment_type IN ('auto_balance', 'round_robin', 'manual', 'rebalance')),
  actor_user_id bigint REFERENCES public.system_users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ticket_assignment_history_ticket
  ON public.ticket_assignment_history (ticket_id, assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_assignment_history_agent
  ON public.ticket_assignment_history (agent_user_id, assigned_at DESC);

-- 4) Availability logs: actor + source (self / supervisor / system)
ALTER TABLE public.agent_availability_logs
  ADD COLUMN IF NOT EXISTS changed_by_user_id bigint REFERENCES public.system_users (id) ON DELETE SET NULL;

ALTER TABLE public.agent_availability_logs
  ADD COLUMN IF NOT EXISTS change_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_availability_logs_change_source_check'
  ) THEN
    ALTER TABLE public.agent_availability_logs
      ADD CONSTRAINT agent_availability_logs_change_source_check
      CHECK (change_source IS NULL OR change_source IN ('self', 'supervisor', 'system'));
  END IF;
END $$;

-- 5) Busy interval start (mirrors break_started_at)
ALTER TABLE public.agent_profiles
  ADD COLUMN IF NOT EXISTS busy_started_at timestamptz;

COMMENT ON COLUMN public.agent_profiles.busy_started_at IS 'When current busy period started; cleared when leaving busy.';
