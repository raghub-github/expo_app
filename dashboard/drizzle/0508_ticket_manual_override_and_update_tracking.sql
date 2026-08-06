-- Manual-override + full update tracking for unified tickets.
--
-- Two problems this fixes:
--   1) Workflow automation (ticket_updated rules, default-routing-group fallback,
--      queue auto-balance) re-applied itself right after an agent/admin manually
--      changed status / priority / group / assignee, silently reverting the edit.
--      We now stamp a per-field manual override on the ticket so the engine can
--      skip exactly the fields a human owns, while everything else keeps
--      following the normal group-assignment and priority rules.
--   2) Only status / priority / assignee / group changes were audited, and the
--      DB trigger attributed every change to the *reporter* (raised_by_*) or to
--      'SYSTEM'. Every mutation now carries the acting user.
--
-- Idempotent. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1) Who touched the ticket last (fast read without joining the audit table)
-- ---------------------------------------------------------------------------
ALTER TABLE public.unified_tickets
  ADD COLUMN IF NOT EXISTS last_updated_by_user_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS last_updated_by_name    TEXT   NULL,
  ADD COLUMN IF NOT EXISTS last_updated_by_email   TEXT   NULL,
  ADD COLUMN IF NOT EXISTS last_updated_at         TIMESTAMPTZ NULL,
  -- 'manual_single' | 'manual_bulk' | 'automation' | 'queue_balance' | 'system'
  ADD COLUMN IF NOT EXISTS last_update_source      TEXT   NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unified_tickets_last_updated_by_user_id_fkey'
  ) THEN
    ALTER TABLE public.unified_tickets
      ADD CONSTRAINT unified_tickets_last_updated_by_user_id_fkey
      FOREIGN KEY (last_updated_by_user_id) REFERENCES public.system_users (id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS unified_tickets_last_updated_by_idx
  ON public.unified_tickets (last_updated_by_user_id, last_updated_at DESC)
  WHERE last_updated_by_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Audit rows: correlate a bulk action, and record how the change was made
-- ---------------------------------------------------------------------------
ALTER TABLE public.unified_ticket_activity_audit
  ADD COLUMN IF NOT EXISTS batch_id           TEXT    NULL,
  ADD COLUMN IF NOT EXISTS update_source      TEXT    NULL,
  ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS unified_ticket_activity_audit_batch_id_idx
  ON public.unified_ticket_activity_audit (batch_id, created_at DESC)
  WHERE batch_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) Manual overrides live in unified_tickets.metadata->'manual_overrides':
--
--      {"priority": {"at": "...", "by_user_id": 12, "by_name": "...",
--                    "by_email": "...", "source": "manual_bulk",
--                    "value": "LOW"}}
--
--    Keys: status | priority | group | assignee.
--    Index so "which tickets are pinned by a human" stays cheap.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS unified_tickets_manual_overrides_idx
  ON public.unified_tickets USING gin ((metadata -> 'manual_overrides'))
  WHERE metadata ? 'manual_overrides';

-- ---------------------------------------------------------------------------
-- 4) Trigger attribution fix.
--
--    log_ticket_activity() (migration 0020) stamped status/priority changes with
--    the ticket *reporter* (raised_by_type / raised_by_id / raised_by_name) and
--    assignment changes with a hardcoded 'SYSTEM'. Every dashboard edit therefore
--    showed the customer/merchant as the actor. Prefer the acting user that the
--    API now writes onto the row; fall back to 'SYSTEM' only when the change
--    came in outside the API.
--
--    NOTE: unified_ticket_activities.actor_type is the enum
--    public.unified_ticket_source (CUSTOMER, RIDER, MERCHANT, SYSTEM, EMAIL,
--    AGENT, WHATSAPP, CALL, OTHER_CORPORATE). plpgsql will not implicitly cast
--    text into it, so v_actor_type must be declared with the enum type and hold
--    only a valid label. The update *source* (manual_single / manual_bulk /
--    automation) is a different concept and lives on
--    unified_tickets.last_update_source, never here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_ticket_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_type public.unified_ticket_source;
  v_actor_id   BIGINT;
  v_actor_name TEXT;
  v_has_actor  BOOLEAN;
BEGIN
  -- An API-driven change refreshes last_updated_at on the same UPDATE.
  v_has_actor := NEW.last_updated_by_user_id IS NOT NULL
                 AND NEW.last_updated_at IS DISTINCT FROM OLD.last_updated_at;

  IF v_has_actor THEN
    v_actor_type := 'AGENT'::public.unified_ticket_source;
    v_actor_id   := NEW.last_updated_by_user_id;
    v_actor_name := COALESCE(NEW.last_updated_by_name, NEW.last_updated_by_email, 'Agent');
  ELSE
    v_actor_type := 'SYSTEM'::public.unified_ticket_source;
    v_actor_id   := NULL;
    v_actor_name := 'System';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.unified_ticket_activities (
      ticket_id, activity_type, activity_description, actor_type, actor_id, actor_name, old_value, new_value
    ) VALUES (
      NEW.id,
      'STATUS_CHANGED',
      'Status changed from ' || COALESCE(OLD.status::text, '-') || ' to ' || COALESCE(NEW.status::text, '-'),
      v_actor_type, v_actor_id, v_actor_name,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
  END IF;

  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO public.unified_ticket_activities (
      ticket_id, activity_type, activity_description, actor_type, actor_id, actor_name, old_value, new_value
    ) VALUES (
      NEW.id,
      'PRIORITY_CHANGED',
      'Priority changed from ' || COALESCE(OLD.priority::text, '-') || ' to ' || COALESCE(NEW.priority::text, '-'),
      v_actor_type, v_actor_id, v_actor_name,
      jsonb_build_object('priority', OLD.priority),
      jsonb_build_object('priority', NEW.priority)
    );
  END IF;

  IF OLD.assigned_to_agent_id IS DISTINCT FROM NEW.assigned_to_agent_id THEN
    INSERT INTO public.unified_ticket_activities (
      ticket_id, activity_type, activity_description, actor_type, actor_id, actor_name, old_value, new_value
    ) VALUES (
      NEW.id,
      CASE WHEN NEW.assigned_to_agent_id IS NOT NULL THEN 'ASSIGNED' ELSE 'UNASSIGNED' END,
      CASE WHEN NEW.assigned_to_agent_id IS NOT NULL
        THEN 'Assigned to ' || COALESCE(NEW.assigned_to_agent_name, 'agent')
        ELSE 'Unassigned'
      END,
      v_actor_type, v_actor_id, v_actor_name,
      jsonb_build_object('assigned_to_agent_id', OLD.assigned_to_agent_id),
      jsonb_build_object('assigned_to_agent_id', NEW.assigned_to_agent_id)
    );
  END IF;

  IF OLD.group_id IS DISTINCT FROM NEW.group_id THEN
    INSERT INTO public.unified_ticket_activities (
      ticket_id, activity_type, activity_description, actor_type, actor_id, actor_name, old_value, new_value
    ) VALUES (
      NEW.id,
      'GROUP_CHANGED',
      'Group changed from ' || COALESCE(OLD.group_id::text, '-') || ' to ' || COALESCE(NEW.group_id::text, '-'),
      v_actor_type, v_actor_id, v_actor_name,
      jsonb_build_object('group_id', OLD.group_id),
      jsonb_build_object('group_id', NEW.group_id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 5) Documentation only.
--
--    The seeded 'ticket_updated -> assign_least_loaded' rule (migration 0176)
--    is what reassigned a ticket the moment someone manually unassigned it.
--    No rule data is changed here: the automation engine now reads
--    metadata->'manual_overrides' and skips actions targeting a field a human
--    owns, so the rule stays enabled and keeps working for untouched tickets.
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.unified_tickets.last_update_source IS
  'manual_single | manual_bulk | automation | queue_balance | system';

COMMENT ON COLUMN public.unified_tickets.metadata IS
  'Ticket metadata. metadata->''manual_overrides'' holds per-field locks '
  '(status | priority | group | assignee) set by an agent/admin; the workflow '
  'automation engine skips actions that would overwrite a locked field.';
