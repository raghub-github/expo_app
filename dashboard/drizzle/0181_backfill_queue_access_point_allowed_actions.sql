-- Backfill queue-related access point actions when historical rows were saved with [].
-- This fixes sidebar and page-guard checks that depend on these actions.

UPDATE public.dashboard_access_points
SET
  allowed_actions = '["UPDATE"]'::jsonb,
  updated_at = NOW()
WHERE
  is_active = true
  AND upper(trim(access_point_group)) = 'TICKET_AGENT_STATUS_TOGGLE'
  AND (
    allowed_actions IS NULL
    OR jsonb_typeof(allowed_actions) <> 'array'
    OR jsonb_array_length(allowed_actions) = 0
  );

UPDATE public.dashboard_access_points
SET
  allowed_actions = '["VIEW"]'::jsonb,
  updated_at = NOW()
WHERE
  is_active = true
  AND upper(trim(access_point_group)) = 'TICKET_QUEUE_SUPERVISOR'
  AND (
    allowed_actions IS NULL
    OR jsonb_typeof(allowed_actions) <> 'array'
    OR jsonb_array_length(allowed_actions) = 0
  );

UPDATE public.dashboard_access_points
SET
  allowed_actions = '["VIEW"]'::jsonb,
  updated_at = NOW()
WHERE
  is_active = true
  AND upper(trim(access_point_group)) = 'TICKET_QUEUE_MANAGER'
  AND (
    allowed_actions IS NULL
    OR jsonb_typeof(allowed_actions) <> 'array'
    OR jsonb_array_length(allowed_actions) = 0
  );
