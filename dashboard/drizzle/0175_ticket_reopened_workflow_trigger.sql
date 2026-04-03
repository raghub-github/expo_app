-- Allow trigger_event = ticket_reopened on automation rules and jobs.
-- Safe to re-run.

DO $$
BEGIN
  IF to_regclass('public.ticket_automation_jobs') IS NOT NULL THEN
    ALTER TABLE public.ticket_automation_jobs DROP CONSTRAINT IF EXISTS ticket_automation_jobs_trigger_check;
    ALTER TABLE public.ticket_automation_jobs ADD CONSTRAINT ticket_automation_jobs_trigger_check CHECK (
      trigger_event = ANY (
        ARRAY[
          'ticket_created'::text,
          'ticket_updated'::text,
          'ticket_reopened'::text,
          'agent_went_online'::text,
          'agent_went_offline'::text
        ]
      )
    );
  END IF;

  IF to_regclass('public.ticket_automation_rules') IS NOT NULL THEN
    ALTER TABLE public.ticket_automation_rules DROP CONSTRAINT IF EXISTS ticket_automation_rules_trigger_event_check;
    ALTER TABLE public.ticket_automation_rules ADD CONSTRAINT ticket_automation_rules_trigger_event_check CHECK (
      trigger_event = ANY (
        ARRAY[
          'ticket_created'::text,
          'ticket_updated'::text,
          'ticket_reopened'::text,
          'agent_went_online'::text,
          'agent_went_offline'::text
        ]
      )
    );
  END IF;
END;
$$;
