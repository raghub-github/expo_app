-- Run after a failed 0166 (index step) or any env where ticket_automation_executions predates workflow columns.
-- Ensures idempotency_key exists before partial unique index. Ensures ticket_auto_assign_distribution exists.
-- Safe to re-run.

DO $exec_upgrade$
BEGIN
  IF to_regclass('public.ticket_automation_executions') IS NOT NULL THEN
    ALTER TABLE public.ticket_automation_executions
      ADD COLUMN IF NOT EXISTS idempotency_key text NULL,
      ADD COLUMN IF NOT EXISTS trigger_event text,
      ADD COLUMN IF NOT EXISTS agent_user_id bigint,
      ADD COLUMN IF NOT EXISTS actions_executed jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS actions_failed jsonb DEFAULT '[]'::jsonb;

    UPDATE public.ticket_automation_executions
    SET trigger_event = 'ticket_updated'
    WHERE trigger_event IS NULL;

    BEGIN
      ALTER TABLE public.ticket_automation_executions
        ALTER COLUMN trigger_event SET DEFAULT 'ticket_updated',
        ALTER COLUMN trigger_event SET NOT NULL;
    EXCEPTION
      WHEN others THEN
        NULL;
    END;

    BEGIN
      ALTER TABLE public.ticket_automation_executions ALTER COLUMN ticket_id DROP NOT NULL;
    EXCEPTION
      WHEN others THEN
        NULL;
    END;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ticket_automation_executions_agent_user_id_fkey'
        AND conrelid = 'public.ticket_automation_executions'::regclass
    ) THEN
      ALTER TABLE public.ticket_automation_executions
        ADD CONSTRAINT ticket_automation_executions_agent_user_id_fkey
          FOREIGN KEY (agent_user_id) REFERENCES public.system_users (id) ON DELETE SET NULL;
    END IF;
  END IF;
END;
$exec_upgrade$;

DO $idx$
BEGIN
  IF to_regclass('public.ticket_automation_executions') IS NOT NULL THEN
    EXECUTE $sql$
      CREATE UNIQUE INDEX IF NOT EXISTS ticket_automation_executions_idempotency_uidx
        ON public.ticket_automation_executions (idempotency_key)
        WHERE idempotency_key IS NOT NULL
    $sql$;
  END IF;
END;
$idx$;

CREATE TABLE IF NOT EXISTS public.ticket_auto_assign_distribution (
  id smallint NOT NULL,
  primary_slots_remaining smallint NOT NULL DEFAULT 2,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_auto_assign_distribution_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_auto_assign_distribution_singleton CHECK ((id = 1))
);

INSERT INTO public.ticket_auto_assign_distribution (id, primary_slots_remaining)
VALUES (1, 2)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.ticket_auto_assign_distribution IS
  'Singleton id=1: primary_slots_remaining for 2:1 primary:secondary round-robin queue assign.';
