-- Production ticket auto-assignment: metadata columns, job idempotency, agent_went_offline trigger.
-- Safe to re-run. Skips automation objects if tables from 0166 are absent.

-- ---------------------------------------------------------------------------
-- Ticket metadata for assignment audit + reopen priority
-- ---------------------------------------------------------------------------
ALTER TABLE public.unified_tickets
  ADD COLUMN IF NOT EXISTS assignment_type text NULL,
  ADD COLUMN IF NOT EXISTS reopen_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.unified_tickets.assignment_type IS
  'How last assignee was set: auto_round_robin, auto_least_loaded, auto_priority_weighted, automation_assign_to_agent, manual, released_offline, etc.';
COMMENT ON COLUMN public.unified_tickets.reopen_count IS
  'Incremented when ticket returns to OPEN/REOPENED from RESOLVED/CLOSED; used for routing priority.';

-- ---------------------------------------------------------------------------
-- Automation jobs: idempotency + agent_went_offline
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.ticket_automation_jobs') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.ticket_automation_jobs
    ADD COLUMN IF NOT EXISTS idempotency_key text NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS ticket_automation_jobs_idempotency_uidx
    ON public.ticket_automation_jobs (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

  COMMENT ON COLUMN public.ticket_automation_jobs.idempotency_key IS
    'Optional deduplication key for enqueue (e.g. offline-reassign). Unique when set.';

  ALTER TABLE public.ticket_automation_jobs DROP CONSTRAINT IF EXISTS ticket_automation_jobs_trigger_check;
  ALTER TABLE public.ticket_automation_jobs ADD CONSTRAINT ticket_automation_jobs_trigger_check CHECK (
    trigger_event = ANY (
      ARRAY[
        'ticket_created'::text,
        'ticket_updated'::text,
        'agent_went_online'::text,
        'agent_went_offline'::text
      ]
    )
  );

  ALTER TABLE public.ticket_automation_jobs DROP CONSTRAINT IF EXISTS ticket_automation_jobs_target_check;
  ALTER TABLE public.ticket_automation_jobs ADD CONSTRAINT ticket_automation_jobs_target_check CHECK (
    (
      trigger_event = 'agent_went_online'::text
      AND agent_user_id IS NOT NULL
      AND ticket_id IS NULL
    )
    OR (
      trigger_event = 'agent_went_offline'::text
      AND agent_user_id IS NOT NULL
      AND ticket_id IS NULL
    )
    OR (
      trigger_event <> ALL (
        ARRAY[
          'agent_went_online'::text,
          'agent_went_offline'::text
        ]
      )
      AND ticket_id IS NOT NULL
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Rules + executions: allow agent_went_offline trigger
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.ticket_automation_rules') IS NOT NULL THEN
    ALTER TABLE public.ticket_automation_rules DROP CONSTRAINT IF EXISTS ticket_automation_rules_trigger_event_check;
    ALTER TABLE public.ticket_automation_rules ADD CONSTRAINT ticket_automation_rules_trigger_event_check CHECK (
      trigger_event = ANY (
        ARRAY[
          'ticket_created'::text,
          'ticket_updated'::text,
          'agent_went_online'::text,
          'agent_went_offline'::text
        ]
      )
    );
  END IF;

  IF to_regclass('public.ticket_automation_executions') IS NOT NULL THEN
    ALTER TABLE public.ticket_automation_executions DROP CONSTRAINT IF EXISTS ticket_automation_executions_target_check;
    ALTER TABLE public.ticket_automation_executions ADD CONSTRAINT ticket_automation_executions_target_check CHECK (
      (
        trigger_event = ANY (ARRAY['agent_went_online'::text, 'agent_went_offline'::text])
        AND agent_user_id IS NOT NULL
      )
      OR (
        trigger_event <> ALL (ARRAY['agent_went_online'::text, 'agent_went_offline'::text])
        AND ticket_id IS NOT NULL
      )
    );
  END IF;
END;
$$;
