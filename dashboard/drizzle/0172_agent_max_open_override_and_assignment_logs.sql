-- Per-agent max open tickets (optional override) + automation log type for assignment skips.

ALTER TABLE public.agent_profiles
  ADD COLUMN IF NOT EXISTS max_open_tickets_override integer NULL;

ALTER TABLE public.agent_profiles
  DROP CONSTRAINT IF EXISTS agent_profiles_max_open_override_check;

ALTER TABLE public.agent_profiles
  ADD CONSTRAINT agent_profiles_max_open_override_check CHECK (
    max_open_tickets_override IS NULL
    OR (max_open_tickets_override >= 1 AND max_open_tickets_override <= 500)
  );

COMMENT ON COLUMN public.agent_profiles.max_open_tickets_override IS
  'Optional stricter cap on concurrent open (non-terminal) tickets. NULL uses global queue cap only. Effective cap per agent: LEAST(global_cap, COALESCE(override, global_cap)).';

ALTER TABLE public.ticket_automation_logs
  DROP CONSTRAINT IF EXISTS ticket_automation_logs_log_type_check;

ALTER TABLE public.ticket_automation_logs
  ADD CONSTRAINT ticket_automation_logs_log_type_check CHECK (
    log_type = ANY (
      ARRAY[
        'rule_audit'::text,
        'execution'::text,
        'job'::text,
        'error'::text,
        'assignment_skip'::text
      ]
    )
  );
