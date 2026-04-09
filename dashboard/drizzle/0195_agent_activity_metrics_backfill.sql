-- Hardens agent activity tracking for:
-- - Tickets assigned to agent
-- - Tickets resolved
-- - Tickets reopened
-- - Tickets reassigned from agent
-- - Tickets snoozed
-- - Private notes
-- - Responses
--
-- Safe to run multiple times.

-- 1) Ensure core ticket timestamps are present where logically expected.
UPDATE public.unified_tickets
SET assigned_at = COALESCE(assigned_at, updated_at, created_at)
WHERE assigned_to_agent_id IS NOT NULL
  AND assigned_at IS NULL;

UPDATE public.unified_tickets
SET resolved_at = COALESCE(resolved_at, updated_at, created_at)
WHERE status::text IN ('RESOLVED', 'CLOSED')
  AND resolved_at IS NULL;

UPDATE public.unified_tickets
SET closed_at = COALESCE(closed_at, resolved_at, updated_at, created_at)
WHERE status::text = 'CLOSED'
  AND closed_at IS NULL;

-- Reopened time backfill from audit timeline (latest reopen event).
WITH reopened_events AS (
  SELECT
    a.ticket_id,
    MAX(a.created_at) AS reopened_at
  FROM public.unified_ticket_activity_audit a
  WHERE LOWER(COALESCE(a.activity_type, '')) = 'reopened'
  GROUP BY a.ticket_id
)
UPDATE public.unified_tickets ut
SET reopened_at = re.reopened_at
FROM reopened_events re
WHERE ut.id = re.ticket_id
  AND ut.reopened_at IS NULL;

-- 2) Insert synthetic audit rows if legacy rows are missing timeline events.
--    This keeps "reassigned/reopened/resolved" analytics complete for historic records.

-- Missing assignment audit (one synthetic row per ticket).
INSERT INTO public.unified_ticket_activity_audit (
  ticket_id,
  activity_type,
  activity_category,
  activity_description,
  actor_user_id,
  assigned_to_user_id,
  assigned_to_name,
  metadata,
  created_at
)
SELECT
  ut.id,
  'assignment',
  'assignment',
  'Synthetic assignment backfill from unified_tickets.assigned_at',
  ut.assigned_to_agent_id,
  ut.assigned_to_agent_id,
  ut.assigned_to_agent_name,
  jsonb_build_object('synthetic_backfill', true, 'source', '0195_agent_activity_metrics_backfill'),
  ut.assigned_at
FROM public.unified_tickets ut
WHERE ut.assigned_to_agent_id IS NOT NULL
  AND ut.assigned_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.unified_ticket_activity_audit a
    WHERE a.ticket_id = ut.id
      AND LOWER(COALESCE(a.activity_type, '')) = 'assignment'
  );

-- Missing resolved audit.
INSERT INTO public.unified_ticket_activity_audit (
  ticket_id,
  activity_type,
  activity_category,
  activity_description,
  actor_user_id,
  resolved_by_user_id,
  metadata,
  created_at
)
SELECT
  ut.id,
  'resolved',
  'status',
  'Synthetic resolved backfill from unified_tickets.resolved_at',
  ut.resolved_by,
  ut.resolved_by,
  jsonb_build_object('synthetic_backfill', true, 'source', '0195_agent_activity_metrics_backfill'),
  ut.resolved_at
FROM public.unified_tickets ut
WHERE ut.resolved_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.unified_ticket_activity_audit a
    WHERE a.ticket_id = ut.id
      AND LOWER(COALESCE(a.activity_type, '')) = 'resolved'
  );

-- Missing reopened audit.
INSERT INTO public.unified_ticket_activity_audit (
  ticket_id,
  activity_type,
  activity_category,
  activity_description,
  reopened_by_user_id,
  metadata,
  created_at
)
SELECT
  ut.id,
  'reopened',
  'status',
  'Synthetic reopened backfill from unified_tickets.reopened_at',
  ut.assigned_to_agent_id,
  jsonb_build_object('synthetic_backfill', true, 'source', '0195_agent_activity_metrics_backfill'),
  ut.reopened_at
FROM public.unified_tickets ut
WHERE ut.reopened_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.unified_ticket_activity_audit a
    WHERE a.ticket_id = ut.id
      AND LOWER(COALESCE(a.activity_type, '')) = 'reopened'
  );

-- Missing snoozed audit (best-effort backfill for currently snoozed rows).
INSERT INTO public.unified_ticket_activity_audit (
  ticket_id,
  activity_type,
  activity_category,
  activity_description,
  actor_user_id,
  metadata,
  created_at
)
SELECT
  ut.id,
  'snoozed',
  'status',
  'Synthetic snoozed backfill from unified_tickets state',
  ut.assigned_to_agent_id,
  jsonb_build_object('synthetic_backfill', true, 'source', '0195_agent_activity_metrics_backfill'),
  COALESCE(ut.updated_at, ut.created_at)
FROM public.unified_tickets ut
WHERE ut.status::text = 'SNOOZED'
  AND ut.assigned_to_agent_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.unified_ticket_activity_audit a
    WHERE a.ticket_id = ut.id
      AND LOWER(COALESCE(a.activity_type, '')) = 'snoozed'
  );

-- 3) Performance indexes for activity reporting windows.
CREATE INDEX IF NOT EXISTS unified_tickets_assignee_assigned_at_idx
  ON public.unified_tickets (assigned_to_agent_id, assigned_at DESC)
  WHERE assigned_to_agent_id IS NOT NULL AND assigned_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS unified_tickets_assignee_resolved_at_idx
  ON public.unified_tickets (assigned_to_agent_id, resolved_at DESC)
  WHERE assigned_to_agent_id IS NOT NULL AND resolved_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS unified_tickets_assignee_reopened_at_idx
  ON public.unified_tickets (assigned_to_agent_id, reopened_at DESC)
  WHERE assigned_to_agent_id IS NOT NULL AND reopened_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS unified_ticket_activity_audit_type_created_at_idx
  ON public.unified_ticket_activity_audit (activity_type, created_at DESC);

CREATE INDEX IF NOT EXISTS unified_ticket_activity_audit_actor_type_created_at_idx
  ON public.unified_ticket_activity_audit (actor_user_id, activity_type, created_at DESC)
  WHERE actor_user_id IS NOT NULL;
