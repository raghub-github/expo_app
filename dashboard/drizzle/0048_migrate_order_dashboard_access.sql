-- Migrate Existing ORDER Dashboard Access to New Order Type Dashboards
-- Migration: 0048_migrate_order_dashboard_access
-- Changes: Convert existing ORDER dashboard access to ORDER_FOOD, ORDER_PERSON_RIDE, ORDER_PARCEL

-- ============================================================================
-- STEP 1: Migrate dashboard_access records
-- ============================================================================

-- For each user with ORDER dashboard access, create three new records (one for each order type)
-- This gives users access to all three order types by default
INSERT INTO dashboard_access (
  system_user_id,
  dashboard_type,
  order_type,
  access_level,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  created_at,
  updated_at
)
SELECT 
  system_user_id,
  'ORDER_FOOD' as dashboard_type,
  'food' as order_type,
  access_level,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  NOW() as created_at,
  NOW() as updated_at
FROM dashboard_access
WHERE dashboard_type = 'ORDER'
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access da2 
    WHERE da2.system_user_id = dashboard_access.system_user_id 
      AND da2.dashboard_type = 'ORDER_FOOD'
  );

INSERT INTO dashboard_access (
  system_user_id,
  dashboard_type,
  order_type,
  access_level,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  created_at,
  updated_at
)
SELECT 
  system_user_id,
  'ORDER_PERSON_RIDE' as dashboard_type,
  'person_ride' as order_type,
  access_level,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  NOW() as created_at,
  NOW() as updated_at
FROM dashboard_access
WHERE dashboard_type = 'ORDER'
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access da2 
    WHERE da2.system_user_id = dashboard_access.system_user_id 
      AND da2.dashboard_type = 'ORDER_PERSON_RIDE'
  );

INSERT INTO dashboard_access (
  system_user_id,
  dashboard_type,
  order_type,
  access_level,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  created_at,
  updated_at
)
SELECT 
  system_user_id,
  'ORDER_PARCEL' as dashboard_type,
  'parcel' as order_type,
  access_level,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  NOW() as created_at,
  NOW() as updated_at
FROM dashboard_access
WHERE dashboard_type = 'ORDER'
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access da2 
    WHERE da2.system_user_id = dashboard_access.system_user_id 
      AND da2.dashboard_type = 'ORDER_PARCEL'
  );

-- ============================================================================
-- STEP 2: Migrate dashboard_access_points records
-- ============================================================================

-- Migrate access points for ORDER_FOOD
INSERT INTO dashboard_access_points (
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
  system_user_id,
  'ORDER_FOOD' as dashboard_type,
  'food' as order_type,
  access_point_group,
  access_point_name,
  access_point_description,
  allowed_actions,
  context,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  NOW() as created_at,
  NOW() as updated_at
FROM dashboard_access_points
WHERE dashboard_type = 'ORDER'
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access_points dap2 
    WHERE dap2.system_user_id = dashboard_access_points.system_user_id 
      AND dap2.dashboard_type = 'ORDER_FOOD'
      AND dap2.access_point_group = dashboard_access_points.access_point_group
  );

-- Migrate access points for ORDER_PERSON_RIDE
INSERT INTO dashboard_access_points (
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
  system_user_id,
  'ORDER_PERSON_RIDE' as dashboard_type,
  'person_ride' as order_type,
  access_point_group,
  access_point_name,
  access_point_description,
  allowed_actions,
  context,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  NOW() as created_at,
  NOW() as updated_at
FROM dashboard_access_points
WHERE dashboard_type = 'ORDER'
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access_points dap2 
    WHERE dap2.system_user_id = dashboard_access_points.system_user_id 
      AND dap2.dashboard_type = 'ORDER_PERSON_RIDE'
      AND dap2.access_point_group = dashboard_access_points.access_point_group
  );

-- Migrate access points for ORDER_PARCEL
INSERT INTO dashboard_access_points (
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
  system_user_id,
  'ORDER_PARCEL' as dashboard_type,
  'parcel' as order_type,
  access_point_group,
  access_point_name,
  access_point_description,
  allowed_actions,
  context,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  NOW() as created_at,
  NOW() as updated_at
FROM dashboard_access_points
WHERE dashboard_type = 'ORDER'
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access_points dap2 
    WHERE dap2.system_user_id = dashboard_access_points.system_user_id 
      AND dap2.dashboard_type = 'ORDER_PARCEL'
      AND dap2.access_point_group = dashboard_access_points.access_point_group
  );

-- ============================================================================
-- STEP 3: Optional - Archive old ORDER dashboard access records
-- Uncomment the following if you want to mark old records as inactive
-- ============================================================================

-- UPDATE dashboard_access
-- SET is_active = false,
--     revoked_at = NOW(),
--     revoke_reason = 'Migrated to order type specific dashboards'
-- WHERE dashboard_type = 'ORDER';

-- UPDATE dashboard_access_points
-- SET is_active = false,
--     revoked_at = NOW(),
--     revoke_reason = 'Migrated to order type specific dashboards'
-- WHERE dashboard_type = 'ORDER';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE dashboard_access IS 
  'Dashboard access records. For order dashboards, order_type specifies which order type the user can access. NULL means access to all order types.';
