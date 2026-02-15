-- Activity audit for unified_tickets: every action on a ticket is recorded here.
-- Structure mirrors ticket_activity_audit but ticket_id references unified_tickets(id).

CREATE TABLE IF NOT EXISTS public.unified_ticket_activity_audit (
  id BIGSERIAL NOT NULL,
  ticket_id BIGINT NOT NULL,
  activity_type TEXT NOT NULL,
  activity_category TEXT NOT NULL,
  activity_description TEXT NOT NULL,
  actor_user_id BIGINT NULL,
  actor_type TEXT NULL,
  actor_id BIGINT NULL,
  actor_name TEXT NULL,
  actor_role TEXT NULL,
  assigned_to_user_id BIGINT NULL,
  assigned_to_name TEXT NULL,
  assigned_by_type TEXT NULL,
  previous_assignee_user_id BIGINT NULL,
  previous_assignee_name TEXT NULL,
  old_status TEXT NULL,
  new_status TEXT NULL,
  status_change_reason TEXT NULL,
  old_priority TEXT NULL,
  new_priority TEXT NULL,
  priority_change_reason TEXT NULL,
  old_group_id BIGINT NULL,
  new_group_id BIGINT NULL,
  reopened_by_user_id BIGINT NULL,
  reopened_reason TEXT NULL,
  reopened_from_status TEXT NULL,
  reopened_to_status TEXT NULL,
  response_message_id BIGINT NULL,
  response_type TEXT NULL,
  is_first_response BOOLEAN NULL DEFAULT false,
  resolved_by_user_id BIGINT NULL,
  resolution_type TEXT NULL,
  resolution_notes TEXT NULL,
  unassigned_by_user_id BIGINT NULL,
  unassignment_reason TEXT NULL,
  old_value JSONB NULL,
  new_value JSONB NULL,
  changed_fields TEXT[] NULL,
  metadata JSONB NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unified_ticket_activity_audit_pkey PRIMARY KEY (id),
  CONSTRAINT unified_ticket_activity_audit_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES unified_tickets (id) ON DELETE CASCADE,
  CONSTRAINT unified_ticket_activity_audit_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES system_users (id) ON DELETE SET NULL,
  CONSTRAINT unified_ticket_activity_audit_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES system_users (id) ON DELETE SET NULL,
  CONSTRAINT unified_ticket_activity_audit_new_group_id_fkey FOREIGN KEY (new_group_id) REFERENCES ticket_groups (id) ON DELETE SET NULL,
  CONSTRAINT unified_ticket_activity_audit_old_group_id_fkey FOREIGN KEY (old_group_id) REFERENCES ticket_groups (id) ON DELETE SET NULL,
  CONSTRAINT unified_ticket_activity_audit_previous_assignee_user_id_fkey FOREIGN KEY (previous_assignee_user_id) REFERENCES system_users (id) ON DELETE SET NULL,
  CONSTRAINT unified_ticket_activity_audit_reopened_by_user_id_fkey FOREIGN KEY (reopened_by_user_id) REFERENCES system_users (id) ON DELETE SET NULL,
  CONSTRAINT unified_ticket_activity_audit_resolved_by_user_id_fkey FOREIGN KEY (resolved_by_user_id) REFERENCES system_users (id) ON DELETE SET NULL,
  CONSTRAINT unified_ticket_activity_audit_unassigned_by_user_id_fkey FOREIGN KEY (unassigned_by_user_id) REFERENCES system_users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS unified_ticket_activity_audit_ticket_id_idx
  ON public.unified_ticket_activity_audit (ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS unified_ticket_activity_audit_activity_type_idx
  ON public.unified_ticket_activity_audit (activity_type, created_at DESC);

CREATE INDEX IF NOT EXISTS unified_ticket_activity_audit_activity_category_idx
  ON public.unified_ticket_activity_audit (activity_category, created_at DESC);

CREATE INDEX IF NOT EXISTS unified_ticket_activity_audit_actor_user_id_idx
  ON public.unified_ticket_activity_audit (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS unified_ticket_activity_audit_created_at_idx
  ON public.unified_ticket_activity_audit (created_at DESC);
