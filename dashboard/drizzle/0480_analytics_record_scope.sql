-- =============================================================================
-- 0480: Analytics Own/Overall scope + fix misleading FULL_ACCESS labels
-- =============================================================================
-- 1) Seed ANALYTICS_OWN for users who have ANALYTICS dashboard but no scope point.
-- 2) Rewrite dashboard_access.access_level from actual access points:
--      ANALYTICS → OWN_RECORD | OVERALL_RECORD
--      Other dashboards with selectable points → FULL_ACCESS only when all
--      defined groups are granted; otherwise PARTIAL_ACCESS / VIEW_ONLY.
-- Super admins do not need rows — app grants OVERALL / full access in code.
-- Idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Analytics scope access points (default Own Record)
-- ---------------------------------------------------------------------------
INSERT INTO public.dashboard_access_points (
  system_user_id,
  dashboard_type,
  order_type,
  access_point_group,
  access_point_name,
  access_point_description,
  allowed_actions,
  context,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  created_at,
  updated_at
)
SELECT
  da.system_user_id,
  'ANALYTICS',
  NULL,
  'ANALYTICS_OWN',
  'Own Record',
  'View only your own agent analytics (sessions, tickets, orders).',
  '["VIEW"]'::jsonb,
  '{"scope":"OWN"}'::jsonb,
  true,
  da.granted_by,
  COALESCE(da.granted_by_name, 'migration:0480'),
  NOW(),
  NOW(),
  NOW()
FROM public.dashboard_access da
WHERE da.dashboard_type = 'ANALYTICS'
  AND COALESCE(da.is_active, true) = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.dashboard_access_points dap
    WHERE dap.system_user_id = da.system_user_id
      AND dap.dashboard_type = 'ANALYTICS'
      AND dap.access_point_group IN ('ANALYTICS_OWN', 'ANALYTICS_OVERALL')
      AND COALESCE(dap.is_active, true) = true
  );

-- ---------------------------------------------------------------------------
-- B) Expected access-point counts per dashboard (must match UI definitions)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE IF NOT EXISTS _expected_ap_counts (
  dashboard_type text PRIMARY KEY,
  expected_count int NOT NULL
);

TRUNCATE _expected_ap_counts;
INSERT INTO _expected_ap_counts (dashboard_type, expected_count) VALUES
  ('RIDER', 5),
  ('MERCHANT', 6),
  ('CUSTOMER', 4),
  ('ORDER_FOOD', 4),
  ('ORDER_PERSON_RIDE', 4),
  ('ORDER_PARCEL', 4),
  ('TICKET', 9),
  ('TICKET_FOOD', 2),
  ('TICKET_PARCEL', 2),
  ('TICKET_PERSON_RIDE', 2),
  ('TICKET_GENERAL', 2),
  ('TICKET_CUSTOMER_FOOD', 2),
  ('TICKET_CUSTOMER_PARCEL', 2),
  ('TICKET_CUSTOMER_PERSON_RIDE', 2),
  ('TICKET_CUSTOMER_GENERAL', 2),
  ('OFFER', 3),
  ('AREA_MANAGER', 2),
  ('PAYMENT', 1),
  ('SYSTEM', 0),
  ('ANALYTICS', 1);

-- ---------------------------------------------------------------------------
-- C) Recompute access_level from granted points
-- ---------------------------------------------------------------------------

-- Analytics: Overall
UPDATE public.dashboard_access da
SET
  access_level = 'OVERALL_RECORD',
  updated_at = NOW()
WHERE da.dashboard_type = 'ANALYTICS'
  AND COALESCE(da.is_active, true) = true
  AND EXISTS (
    SELECT 1
    FROM public.dashboard_access_points dap
    WHERE dap.system_user_id = da.system_user_id
      AND dap.dashboard_type = 'ANALYTICS'
      AND dap.access_point_group = 'ANALYTICS_OVERALL'
      AND COALESCE(dap.is_active, true) = true
  );

-- Analytics: Own (when Overall not present)
UPDATE public.dashboard_access da
SET
  access_level = 'OWN_RECORD',
  updated_at = NOW()
WHERE da.dashboard_type = 'ANALYTICS'
  AND COALESCE(da.is_active, true) = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.dashboard_access_points dap
    WHERE dap.system_user_id = da.system_user_id
      AND dap.dashboard_type = 'ANALYTICS'
      AND dap.access_point_group = 'ANALYTICS_OVERALL'
      AND COALESCE(dap.is_active, true) = true
  );

-- Non-analytics: FULL when granted points >= expected; else PARTIAL / VIEW_ONLY
WITH granted AS (
  SELECT
    dap.system_user_id,
    dap.dashboard_type,
    COUNT(DISTINCT dap.access_point_group)::int AS granted_count,
    COUNT(DISTINCT dap.access_point_group) FILTER (
      WHERE dap.access_point_group ILIKE '%_VIEW%'
         OR dap.access_point_group IN ('ORDER_VIEW', 'CUSTOMER_VIEW', 'MERCHANT_VIEW', 'RIDER_VIEW')
    )::int AS view_count
  FROM public.dashboard_access_points dap
  WHERE COALESCE(dap.is_active, true) = true
    AND dap.dashboard_type <> 'ANALYTICS'
  GROUP BY dap.system_user_id, dap.dashboard_type
),
recomputed AS (
  SELECT
    da.id,
    CASE
      WHEN COALESCE(e.expected_count, 0) = 0 THEN 'FULL_ACCESS'
      WHEN COALESCE(g.granted_count, 0) = 0 THEN 'VIEW_ONLY'
      WHEN COALESCE(g.granted_count, 0) >= e.expected_count THEN 'FULL_ACCESS'
      WHEN COALESCE(g.view_count, 0) = COALESCE(g.granted_count, 0) THEN 'VIEW_ONLY'
      ELSE 'PARTIAL_ACCESS'
    END AS new_level
  FROM public.dashboard_access da
  INNER JOIN _expected_ap_counts e ON e.dashboard_type = da.dashboard_type
  LEFT JOIN granted g
    ON g.system_user_id = da.system_user_id
   AND g.dashboard_type = da.dashboard_type
  WHERE da.dashboard_type <> 'ANALYTICS'
    AND COALESCE(da.is_active, true) = true
)
UPDATE public.dashboard_access da
SET
  access_level = r.new_level,
  updated_at = NOW()
FROM recomputed r
WHERE da.id = r.id;

DROP TABLE IF EXISTS _expected_ap_counts;

COMMENT ON TABLE public.dashboard_access_points IS
  'Per-dashboard access points. ANALYTICS uses ANALYTICS_OWN | ANALYTICS_OVERALL. access_level on dashboard_access reflects Full/Partial/View/Own/Overall.';
