-- Rollback 0480
-- Removes Analytics Own/Overall points and restores access_level to FULL_ACCESS
-- for rows that were rewritten by this migration (best-effort).

DELETE FROM public.dashboard_access_points
WHERE dashboard_type = 'ANALYTICS'
  AND access_point_group IN ('ANALYTICS_OWN', 'ANALYTICS_OVERALL');

UPDATE public.dashboard_access
SET
  access_level = 'FULL_ACCESS',
  updated_at = NOW()
WHERE access_level IN ('OWN_RECORD', 'OVERALL_RECORD', 'PARTIAL_ACCESS')
  AND COALESCE(is_active, true) = true;
