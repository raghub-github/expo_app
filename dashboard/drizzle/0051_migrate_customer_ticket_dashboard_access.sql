-- Migrate Customer and Ticket Dashboard Access to New Order Type Dashboards
-- Migration: 0051_migrate_customer_ticket_dashboard_access
-- Changes: Convert existing CUSTOMER and TICKET dashboard access to new order-type-specific dashboards

-- ============================================================================
-- STEP 1: Migrate CUSTOMER dashboard access to CUSTOMER_FOOD, CUSTOMER_PARCEL, CUSTOMER_PERSON_RIDE
-- ============================================================================

-- For each user with CUSTOMER dashboard access, create three new records (one for each order type)
-- This gives users access to all three customer types by default
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
  'CUSTOMER_FOOD' as dashboard_type,
  'food' as order_type,
  access_level,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  created_at,
  updated_at
FROM dashboard_access
WHERE dashboard_type = 'CUSTOMER'
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access da2
    WHERE da2.system_user_id = dashboard_access.system_user_id
      AND da2.dashboard_type = 'CUSTOMER_FOOD'
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
  'CUSTOMER_PARCEL' as dashboard_type,
  'parcel' as order_type,
  access_level,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  created_at,
  updated_at
FROM dashboard_access
WHERE dashboard_type = 'CUSTOMER'
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access da2
    WHERE da2.system_user_id = dashboard_access.system_user_id
      AND da2.dashboard_type = 'CUSTOMER_PARCEL'
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
  'CUSTOMER_PERSON_RIDE' as dashboard_type,
  'person_ride' as order_type,
  access_level,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  created_at,
  updated_at
FROM dashboard_access
WHERE dashboard_type = 'CUSTOMER'
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access da2
    WHERE da2.system_user_id = dashboard_access.system_user_id
      AND da2.dashboard_type = 'CUSTOMER_PERSON_RIDE'
  );

-- ============================================================================
-- STEP 2: Migrate dashboard_access_points for CUSTOMER
-- ============================================================================

-- Migrate CUSTOMER access points to CUSTOMER_FOOD
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
  'CUSTOMER_FOOD' as dashboard_type,
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
  created_at,
  updated_at
FROM dashboard_access_points
WHERE dashboard_type = 'CUSTOMER'
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access_points dap2
    WHERE dap2.system_user_id = dashboard_access_points.system_user_id
      AND dap2.dashboard_type = 'CUSTOMER_FOOD'
      AND dap2.access_point_group = dashboard_access_points.access_point_group
  );

-- Migrate CUSTOMER access points to CUSTOMER_PARCEL
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
  'CUSTOMER_PARCEL' as dashboard_type,
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
  created_at,
  updated_at
FROM dashboard_access_points
WHERE dashboard_type = 'CUSTOMER'
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access_points dap2
    WHERE dap2.system_user_id = dashboard_access_points.system_user_id
      AND dap2.dashboard_type = 'CUSTOMER_PARCEL'
      AND dap2.access_point_group = dashboard_access_points.access_point_group
  );

-- Migrate CUSTOMER access points to CUSTOMER_PERSON_RIDE
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
  'CUSTOMER_PERSON_RIDE' as dashboard_type,
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
  created_at,
  updated_at
FROM dashboard_access_points
WHERE dashboard_type = 'CUSTOMER'
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access_points dap2
    WHERE dap2.system_user_id = dashboard_access_points.system_user_id
      AND dap2.dashboard_type = 'CUSTOMER_PERSON_RIDE'
      AND dap2.access_point_group = dashboard_access_points.access_point_group
  );

-- ============================================================================
-- STEP 3: Migrate TICKET dashboard access
-- ============================================================================

-- Note: For tickets, we'll create access to the main ticket dashboards (TICKET_FOOD, TICKET_PARCEL, TICKET_PERSON_RIDE, TICKET_GENERAL)
-- The more granular dashboards (TICKET_CUSTOMER_FOOD, etc.) can be assigned separately if needed

-- Migrate to TICKET_FOOD
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
  'TICKET_FOOD' as dashboard_type,
  'food' as order_type,
  access_level,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  created_at,
  updated_at
FROM dashboard_access
WHERE dashboard_type = 'TICKET'
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access da2
    WHERE da2.system_user_id = dashboard_access.system_user_id
      AND da2.dashboard_type = 'TICKET_FOOD'
  );

-- Migrate to TICKET_PARCEL
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
  'TICKET_PARCEL' as dashboard_type,
  'parcel' as order_type,
  access_level,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  created_at,
  updated_at
FROM dashboard_access
WHERE dashboard_type = 'TICKET'
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access da2
    WHERE da2.system_user_id = dashboard_access.system_user_id
      AND da2.dashboard_type = 'TICKET_PARCEL'
  );

-- Migrate to TICKET_PERSON_RIDE
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
  'TICKET_PERSON_RIDE' as dashboard_type,
  'person_ride' as order_type,
  access_level,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  created_at,
  updated_at
FROM dashboard_access
WHERE dashboard_type = 'TICKET'
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access da2
    WHERE da2.system_user_id = dashboard_access.system_user_id
      AND da2.dashboard_type = 'TICKET_PERSON_RIDE'
  );

-- Migrate to TICKET_GENERAL (for non-order-related tickets)
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
  'TICKET_GENERAL' as dashboard_type,
  NULL as order_type, -- General tickets are not order-specific
  access_level,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  created_at,
  updated_at
FROM dashboard_access
WHERE dashboard_type = 'TICKET'
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access da2
    WHERE da2.system_user_id = dashboard_access.system_user_id
      AND da2.dashboard_type = 'TICKET_GENERAL'
  );

-- ============================================================================
-- STEP 4: Migrate dashboard_access_points for TICKET
-- ============================================================================

-- Migrate TICKET access points to TICKET_FOOD
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
  'TICKET_FOOD' as dashboard_type,
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
  created_at,
  updated_at
FROM dashboard_access_points
WHERE dashboard_type = 'TICKET'
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access_points dap2
    WHERE dap2.system_user_id = dashboard_access_points.system_user_id
      AND dap2.dashboard_type = 'TICKET_FOOD'
      AND dap2.access_point_group = dashboard_access_points.access_point_group
  );

-- Migrate TICKET access points to TICKET_PARCEL
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
  'TICKET_PARCEL' as dashboard_type,
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
  created_at,
  updated_at
FROM dashboard_access_points
WHERE dashboard_type = 'TICKET'
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access_points dap2
    WHERE dap2.system_user_id = dashboard_access_points.system_user_id
      AND dap2.dashboard_type = 'TICKET_PARCEL'
      AND dap2.access_point_group = dashboard_access_points.access_point_group
  );

-- Migrate TICKET access points to TICKET_PERSON_RIDE
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
  'TICKET_PERSON_RIDE' as dashboard_type,
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
  created_at,
  updated_at
FROM dashboard_access_points
WHERE dashboard_type = 'TICKET'
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access_points dap2
    WHERE dap2.system_user_id = dashboard_access_points.system_user_id
      AND dap2.dashboard_type = 'TICKET_PERSON_RIDE'
      AND dap2.access_point_group = dashboard_access_points.access_point_group
  );

-- Migrate TICKET access points to TICKET_GENERAL
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
  'TICKET_GENERAL' as dashboard_type,
  NULL as order_type,
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
FROM dashboard_access_points
WHERE dashboard_type = 'TICKET'
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access_points dap2
    WHERE dap2.system_user_id = dashboard_access_points.system_user_id
      AND dap2.dashboard_type = 'TICKET_GENERAL'
      AND dap2.access_point_group = dashboard_access_points.access_point_group
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN unified_tickets.order_type IS 
  'Order type for order-related tickets: food, parcel, person_ride. NULL for non-order-related tickets. Used for dashboard filtering and access control.';
