-- Corrective re-apply of log_ticket_activity().
--
-- 0508 ships the correct function, so on a fresh database this migration is a
-- no-op re-apply. It exists for any database that already ran the first,
-- broken revision of 0508, which declared `v_actor_type TEXT` while
-- public.unified_ticket_activities.actor_type is the enum
-- public.unified_ticket_source. plpgsql will not implicitly cast text into an
-- enum column, so that revision raised
--
--   column "actor_type" is of type unified_ticket_source but expression is of
--   type text
--
-- on EVERY update to unified_tickets that changed status, priority, assignee or
-- group -- i.e. every ticket edit, single or bulk.
--
-- The update *source* (manual_single / manual_bulk / automation) is not an
-- actor type and does not belong in this column; it is recorded on
-- unified_tickets.last_update_source and unified_ticket_activity_audit.update_source.
--
-- Valid unified_ticket_source labels:
--   CUSTOMER, RIDER, MERCHANT, SYSTEM, EMAIL, AGENT, WHATSAPP, CALL,
--   OTHER_CORPORATE
--
-- Idempotent. Safe to re-run.

CREATE OR REPLACE FUNCTION public.log_ticket_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_type public.unified_ticket_source;
  v_actor_id   BIGINT;
  v_actor_name TEXT;
  v_has_actor  BOOLEAN;
BEGIN
  -- An API-driven change stamps the acting user on the same UPDATE, so a fresh
  -- last_updated_at is what distinguishes "a person did this" from a background
  -- job or a direct SQL edit.
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
