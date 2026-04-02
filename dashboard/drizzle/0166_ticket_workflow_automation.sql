-- Workflow automation: DB-driven rules, conditions, actions, execution history, job queue, audit logs.
-- Targets public.unified_tickets (helpdesk). Safe to re-run: IF NOT EXISTS / OR REPLACE where applicable.
--
-- Related (unchanged here, documented):
--   ticket_auto_assign_distribution — singleton round-robin 2:1 slots (0162)
--   ticket_auto_generation_rules — system-generated ticket templates (0020)
--   ticket_compose_automation / ticket_notification_automation — compose & email templates

-- ---------------------------------------------------------------------------
-- Upgrade legacy public.ticket_automation_rules (e.g. backend 0061) before indexes
-- ---------------------------------------------------------------------------
-- Older installs have jsonb trigger_conditions/actions and no trigger_event / is_enabled.
-- CREATE TABLE IF NOT EXISTS below is skipped when the table already exists, so we ALTER first.
DO $$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('public.ticket_automation_rules') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.ticket_automation_rules
    ADD COLUMN IF NOT EXISTS trigger_event text NOT NULL DEFAULT 'ticket_updated',
    ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS once_per_ticket boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS stop_after_match boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS max_action_retries integer NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS updated_by_user_id bigint;

  -- Drop old execution_mode CHECK(s) so we can allow 'queued' (legacy allowed scheduled/delayed).
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'ticket_automation_rules'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%execution_mode%'
  LOOP
    EXECUTE format('ALTER TABLE public.ticket_automation_rules DROP CONSTRAINT %I', r.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ticket_automation_rules_execution_mode_check'
      AND conrelid = 'public.ticket_automation_rules'::regclass
  ) THEN
    ALTER TABLE public.ticket_automation_rules
      ADD CONSTRAINT ticket_automation_rules_execution_mode_check CHECK (
        execution_mode = ANY (
          ARRAY['immediate'::text, 'queued'::text, 'scheduled'::text, 'delayed'::text]
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ticket_automation_rules_trigger_event_check'
      AND conrelid = 'public.ticket_automation_rules'::regclass
  ) THEN
    ALTER TABLE public.ticket_automation_rules
      ADD CONSTRAINT ticket_automation_rules_trigger_event_check CHECK (
        trigger_event = ANY (
          ARRAY['ticket_created'::text, 'ticket_updated'::text, 'agent_went_online'::text]
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ticket_automation_rules_updated_by_user_id_fkey'
      AND conrelid = 'public.ticket_automation_rules'::regclass
  ) THEN
    ALTER TABLE public.ticket_automation_rules
      ADD CONSTRAINT ticket_automation_rules_updated_by_user_id_fkey
        FOREIGN KEY (updated_by_user_id) REFERENCES public.system_users (id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Rules (header)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_automation_rules (
  id bigserial NOT NULL,
  rule_code text NOT NULL,
  rule_name text NOT NULL,
  rule_description text NULL,
  rule_priority integer NOT NULL DEFAULT 0,
  trigger_event text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  once_per_ticket boolean NOT NULL DEFAULT false,
  stop_after_match boolean NOT NULL DEFAULT false,
  execution_mode text NOT NULL DEFAULT 'immediate',
  execution_delay_seconds integer NOT NULL DEFAULT 0,
  max_action_retries integer NOT NULL DEFAULT 2,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id bigint NULL,
  updated_by_user_id bigint NULL,
  CONSTRAINT ticket_automation_rules_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_automation_rules_rule_code_key UNIQUE (rule_code),
  CONSTRAINT ticket_automation_rules_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES public.system_users (id) ON DELETE SET NULL,
  CONSTRAINT ticket_automation_rules_updated_by_user_id_fkey
    FOREIGN KEY (updated_by_user_id) REFERENCES public.system_users (id) ON DELETE SET NULL,
  CONSTRAINT ticket_automation_rules_trigger_event_check CHECK (
    trigger_event = ANY (
      ARRAY['ticket_created'::text, 'ticket_updated'::text, 'agent_went_online'::text]
    )
  ),
  CONSTRAINT ticket_automation_rules_execution_mode_check CHECK (
    execution_mode = ANY (ARRAY['immediate'::text, 'queued'::text])
  )
);

CREATE INDEX IF NOT EXISTS ticket_automation_rules_priority_idx
  ON public.ticket_automation_rules (rule_priority DESC, is_enabled, is_active, trigger_event);

DROP TRIGGER IF EXISTS ticket_automation_rules_updated_at_trigger ON public.ticket_automation_rules;
CREATE TRIGGER ticket_automation_rules_updated_at_trigger
  BEFORE UPDATE ON public.ticket_automation_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column ();

-- ---------------------------------------------------------------------------
-- Normalized conditions (AND semantics within a rule)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_automation_rule_conditions (
  id bigserial NOT NULL,
  rule_id bigint NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  field text NOT NULL,
  operator text NOT NULL,
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  CONSTRAINT ticket_automation_rule_conditions_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_automation_rule_conditions_rule_id_fkey
    FOREIGN KEY (rule_id) REFERENCES public.ticket_automation_rules (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ticket_automation_rule_conditions_rule_idx
  ON public.ticket_automation_rule_conditions (rule_id, sort_order);

-- ---------------------------------------------------------------------------
-- Normalized actions (ordered)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_automation_rule_actions (
  id bigserial NOT NULL,
  rule_id bigint NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  action_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ticket_automation_rule_actions_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_automation_rule_actions_rule_id_fkey
    FOREIGN KEY (rule_id) REFERENCES public.ticket_automation_rules (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ticket_automation_rule_actions_rule_idx
  ON public.ticket_automation_rule_actions (rule_id, sort_order);

-- ---------------------------------------------------------------------------
-- Per-run execution records (debugging, idempotency hooks)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_automation_executions (
  id bigserial NOT NULL,
  rule_id bigint NOT NULL,
  ticket_id bigint NULL,
  agent_user_id bigint NULL,
  trigger_event text NOT NULL,
  execution_status text NOT NULL,
  actions_executed jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions_failed jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text NULL,
  idempotency_key text NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  execution_duration_ms integer NULL,
  CONSTRAINT ticket_automation_executions_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_automation_executions_rule_id_fkey
    FOREIGN KEY (rule_id) REFERENCES public.ticket_automation_rules (id) ON DELETE CASCADE,
  CONSTRAINT ticket_automation_executions_ticket_id_fkey
    FOREIGN KEY (ticket_id) REFERENCES public.unified_tickets (id) ON DELETE CASCADE,
  CONSTRAINT ticket_automation_executions_agent_user_id_fkey
    FOREIGN KEY (agent_user_id) REFERENCES public.system_users (id) ON DELETE SET NULL,
  CONSTRAINT ticket_automation_executions_execution_status_check CHECK (
    execution_status = ANY (
      ARRAY[
        'pending'::text,
        'running'::text,
        'completed'::text,
        'failed'::text,
        'skipped'::text
      ]
    )
  ),
  CONSTRAINT ticket_automation_executions_target_check CHECK (
    (trigger_event = 'agent_went_online'::text AND agent_user_id IS NOT NULL)
    OR (trigger_event <> 'agent_went_online'::text AND ticket_id IS NOT NULL)
  )
);

-- Legacy ticket_automation_executions (e.g. backend 0061) may exist without new columns; CREATE above is skipped.
DO $exec_col_upgrade$
BEGIN
  IF to_regclass('public.ticket_automation_executions') IS NULL THEN
    RETURN;
  END IF;
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
END;
$exec_col_upgrade$;

CREATE UNIQUE INDEX IF NOT EXISTS ticket_automation_executions_idempotency_uidx
  ON public.ticket_automation_executions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ticket_automation_executions_ticket_idx
  ON public.ticket_automation_executions (ticket_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS ticket_automation_executions_rule_trigger_idx
  ON public.ticket_automation_executions (rule_id, trigger_event, triggered_at DESC);

-- ---------------------------------------------------------------------------
-- Audit / operational logs (rule CRUD + engine + jobs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_automation_logs (
  id bigserial NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  log_type text NOT NULL,
  rule_id bigint NULL,
  ticket_id bigint NULL,
  actor_user_id bigint NULL,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ticket_automation_logs_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_automation_logs_rule_id_fkey
    FOREIGN KEY (rule_id) REFERENCES public.ticket_automation_rules (id) ON DELETE SET NULL,
  CONSTRAINT ticket_automation_logs_ticket_id_fkey
    FOREIGN KEY (ticket_id) REFERENCES public.unified_tickets (id) ON DELETE SET NULL,
  CONSTRAINT ticket_automation_logs_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES public.system_users (id) ON DELETE SET NULL,
  CONSTRAINT ticket_automation_logs_log_type_check CHECK (
    log_type = ANY (
      ARRAY['rule_audit'::text, 'execution'::text, 'job'::text, 'error'::text]
    )
  )
);

CREATE INDEX IF NOT EXISTS ticket_automation_logs_created_idx
  ON public.ticket_automation_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS ticket_automation_logs_ticket_idx
  ON public.ticket_automation_logs (ticket_id);

-- ---------------------------------------------------------------------------
-- Version snapshots for rule definitions (immutable history)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_automation_rule_versions (
  id bigserial NOT NULL,
  rule_id bigint NOT NULL,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id bigint NULL,
  CONSTRAINT ticket_automation_rule_versions_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_automation_rule_versions_rule_id_fkey
    FOREIGN KEY (rule_id) REFERENCES public.ticket_automation_rules (id) ON DELETE CASCADE,
  CONSTRAINT ticket_automation_rule_versions_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES public.system_users (id) ON DELETE SET NULL,
  CONSTRAINT ticket_automation_rule_versions_rule_version_key UNIQUE (rule_id, version)
);

-- ---------------------------------------------------------------------------
-- Job queue (delayed / decoupled processing; also fed by INSERT on unified_tickets)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_automation_jobs (
  id bigserial NOT NULL,
  ticket_id bigint NULL,
  agent_user_id bigint NULL,
  trigger_event text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  run_after timestamptz NOT NULL DEFAULT now(),
  last_error text NULL,
  locked_at timestamptz NULL,
  locked_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_automation_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_automation_jobs_ticket_id_fkey
    FOREIGN KEY (ticket_id) REFERENCES public.unified_tickets (id) ON DELETE CASCADE,
  CONSTRAINT ticket_automation_jobs_agent_user_id_fkey
    FOREIGN KEY (agent_user_id) REFERENCES public.system_users (id) ON DELETE CASCADE,
  CONSTRAINT ticket_automation_jobs_status_check CHECK (
    status = ANY (
      ARRAY[
        'pending'::text,
        'processing'::text,
        'completed'::text,
        'failed'::text,
        'dead'::text
      ]
    )
  ),
  CONSTRAINT ticket_automation_jobs_trigger_check CHECK (
    trigger_event = ANY (
      ARRAY['ticket_created'::text, 'ticket_updated'::text, 'agent_went_online'::text]
    )
  ),
  CONSTRAINT ticket_automation_jobs_target_check CHECK (
    (trigger_event = 'agent_went_online'::text AND agent_user_id IS NOT NULL AND ticket_id IS NULL)
    OR (trigger_event <> 'agent_went_online'::text AND ticket_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ticket_automation_jobs_pending_idx
  ON public.ticket_automation_jobs (status, run_after)
  WHERE status = ANY (ARRAY['pending'::text, 'processing'::text]);

DROP TRIGGER IF EXISTS ticket_automation_jobs_updated_at_trigger ON public.ticket_automation_jobs;
CREATE TRIGGER ticket_automation_jobs_updated_at_trigger
  BEFORE UPDATE ON public.ticket_automation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column ();

-- ---------------------------------------------------------------------------
-- Event: new unified ticket -> enqueue workflow jobs (fail-safe)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_unified_ticket_automation_job ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
  INSERT INTO public.ticket_automation_jobs (ticket_id, trigger_event, status, run_after)
  VALUES (NEW.id, 'ticket_created', 'pending', NOW());
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_unified_tickets_automation_enqueue ON public.unified_tickets;

CREATE TRIGGER trg_unified_tickets_automation_enqueue
  AFTER INSERT ON public.unified_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_unified_ticket_automation_job ();

COMMENT ON TABLE public.ticket_automation_rules IS
  'Helpdesk workflow automation rules (Freshdesk-style); evaluated on ticket/agent events.';

COMMENT ON TABLE public.ticket_automation_rule_conditions IS
  'AND-combined conditions per rule. Fields: status, priority, group_id, tags, ticket_type, ticket_category, service_type, raised_by_type, ticket_source, assigned_to_agent_id, subject, agent_status (agent_went_online only).';

COMMENT ON TABLE public.ticket_automation_rule_actions IS
  'Ordered actions: assign_round_robin, assign_least_loaded, assign_priority_weighted, assign_to_agent, set_status, set_priority, add_tags, set_group, send_notification, run_queue_balance_for_agent.';

COMMENT ON TABLE public.ticket_automation_executions IS
  'One row per engine run of a rule against a ticket or agent context.';

COMMENT ON TABLE public.ticket_automation_logs IS
  'Audit and diagnostics: rule changes, executions, job lifecycle, errors.';

COMMENT ON TABLE public.ticket_automation_jobs IS
  'Queue for automation runs (ticket_created from trigger; ticket_updated / agent_went_online from app).';

COMMENT ON TABLE public.ticket_auto_assign_distribution IS
  'Singleton row id=1: primary_slots_remaining for 2:1 primary:secondary round-robin (see queue auto-assign).';
