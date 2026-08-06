-- Rollback for 0508_ticket_manual_override_and_update_tracking.sql
-- Restores the migration-0020 version of log_ticket_activity() and drops the
-- tracking / override columns.

CREATE OR REPLACE FUNCTION public.log_ticket_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO unified_ticket_activities (ticket_id, activity_type, activity_description, actor_type, actor_id, actor_name, old_value, new_value)
    VALUES (
      NEW.id,
      'STATUS_CHANGED',
      'Status changed from ' || OLD.status || ' to ' || NEW.status,
      COALESCE(NEW.raised_by_type, 'SYSTEM'),
      NEW.raised_by_id,
      NEW.raised_by_name,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
  END IF;

  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO unified_ticket_activities (ticket_id, activity_type, activity_description, actor_type, actor_id, actor_name, old_value, new_value)
    VALUES (
      NEW.id,
      'PRIORITY_CHANGED',
      'Priority changed from ' || OLD.priority || ' to ' || NEW.priority,
      COALESCE(NEW.raised_by_type, 'SYSTEM'),
      NEW.raised_by_id,
      NEW.raised_by_name,
      jsonb_build_object('priority', OLD.priority),
      jsonb_build_object('priority', NEW.priority)
    );
  END IF;

  IF OLD.assigned_to_agent_id IS DISTINCT FROM NEW.assigned_to_agent_id THEN
    INSERT INTO unified_ticket_activities (ticket_id, activity_type, activity_description, actor_type, actor_id, actor_name, old_value, new_value)
    VALUES (
      NEW.id,
      CASE WHEN NEW.assigned_to_agent_id IS NOT NULL THEN 'ASSIGNED' ELSE 'UNASSIGNED' END,
      CASE WHEN NEW.assigned_to_agent_id IS NOT NULL
        THEN 'Assigned to ' || COALESCE(NEW.assigned_to_agent_name, 'agent')
        ELSE 'Unassigned'
      END,
      'SYSTEM',
      NULL,
      'System',
      jsonb_build_object('assigned_to_agent_id', OLD.assigned_to_agent_id),
      jsonb_build_object('assigned_to_agent_id', NEW.assigned_to_agent_id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP INDEX IF EXISTS public.unified_tickets_manual_overrides_idx;
DROP INDEX IF EXISTS public.unified_tickets_last_updated_by_idx;
DROP INDEX IF EXISTS public.unified_ticket_activity_audit_batch_id_idx;

ALTER TABLE public.unified_ticket_activity_audit
  DROP COLUMN IF EXISTS batch_id,
  DROP COLUMN IF EXISTS update_source,
  DROP COLUMN IF EXISTS is_manual_override;

ALTER TABLE public.unified_tickets
  DROP CONSTRAINT IF EXISTS unified_tickets_last_updated_by_user_id_fkey;

ALTER TABLE public.unified_tickets
  DROP COLUMN IF EXISTS last_updated_by_user_id,
  DROP COLUMN IF EXISTS last_updated_by_name,
  DROP COLUMN IF EXISTS last_updated_by_email,
  DROP COLUMN IF EXISTS last_updated_at,
  DROP COLUMN IF EXISTS last_update_source;

-- Note: metadata->'manual_overrides' payloads are left in place (harmless data).
