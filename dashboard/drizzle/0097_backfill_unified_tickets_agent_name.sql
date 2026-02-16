-- Backfill assigned_to_agent_name on unified_tickets from system_users
-- for rows where assigned_to_agent_id is set but assigned_to_agent_name is null.
-- Run once; PATCH /api/tickets/[id] now sets both columns on assign.

UPDATE public.unified_tickets ut
SET assigned_to_agent_name = COALESCE(su.full_name, su.email, '')
FROM public.system_users su
WHERE ut.assigned_to_agent_id = su.id
  AND (ut.assigned_to_agent_name IS NULL OR ut.assigned_to_agent_name = '');
