-- Consolidate Dashboard Access - Remove Separated Customer and Ticket Dashboards
-- Migration: 0052_consolidate_dashboard_access
-- Changes: Consolidate CUSTOMER_FOOD, CUSTOMER_PARCEL, CUSTOMER_PERSON_RIDE to CUSTOMER
--          Consolidate all TICKET_* variants to TICKET
--          Update access points to new structure
--
-- NOTE: This migration is idempotent and can be run multiple times safely.
-- It uses NOT EXISTS checks and DISTINCT ON to prevent duplicate key errors.

-- ============================================================================
-- STEP 1: Migrate CUSTOMER dashboard access
-- ============================================================================

-- Migrate CUSTOMER_FOOD, CUSTOMER_PARCEL, CUSTOMER_PERSON_RIDE to CUSTOMER
-- If user has access to any customer type, give them CUSTOMER access
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
SELECT DISTINCT
  system_user_id,
  'CUSTOMER' as dashboard_type,
  NULL as order_type, -- CUSTOMER dashboard doesn't use order_type for separation
  access_level,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  NOW() as created_at,
  NOW() as updated_at
FROM dashboard_access
WHERE dashboard_type IN ('CUSTOMER_FOOD', 'CUSTOMER_PARCEL', 'CUSTOMER_PERSON_RIDE')
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access da2
    WHERE da2.system_user_id = dashboard_access.system_user_id
      AND da2.dashboard_type = 'CUSTOMER'
      AND da2.is_active = TRUE
  );

-- Migrate CUSTOMER access points
-- Use DISTINCT ON to ensure uniqueness per (system_user_id, access_point_group)
WITH customer_access_points_deduped AS (
  SELECT DISTINCT ON (system_user_id, access_point_group)
    system_user_id,
    'CUSTOMER' as dashboard_type,
    NULL as order_type,
    access_point_group,
    access_point_name,
    access_point_description,
    allowed_actions,
    context,
    is_active,
    granted_by,
    granted_by_name,
    granted_at
  FROM dashboard_access_points
  WHERE dashboard_type IN ('CUSTOMER_FOOD', 'CUSTOMER_PARCEL', 'CUSTOMER_PERSON_RIDE')
    AND is_active = TRUE
  ORDER BY system_user_id, access_point_group, granted_at DESC
)
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
  NOW() as created_at,
  NOW() as updated_at
FROM customer_access_points_deduped
WHERE NOT EXISTS (
  SELECT 1 FROM dashboard_access_points dap2
  WHERE dap2.system_user_id = customer_access_points_deduped.system_user_id
    AND dap2.dashboard_type = 'CUSTOMER'
    AND dap2.access_point_group = customer_access_points_deduped.access_point_group
    AND dap2.is_active = TRUE
);

-- ============================================================================
-- STEP 2: Migrate TICKET dashboard access
-- ============================================================================

-- Migrate all TICKET_* variants to TICKET
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
SELECT DISTINCT
  system_user_id,
  'TICKET' as dashboard_type,
  NULL as order_type, -- TICKET dashboard uses access points for granularity, not order_type
  access_level,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  NOW() as created_at,
  NOW() as updated_at
FROM dashboard_access
WHERE dashboard_type LIKE 'TICKET_%'
  AND dashboard_type != 'TICKET'
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access da2
    WHERE da2.system_user_id = dashboard_access.system_user_id
      AND da2.dashboard_type = 'TICKET'
      AND da2.is_active = TRUE
  );

-- Migrate TICKET access points with conversion to new structure
-- Map old TICKET_* access points to new granular access points
-- Use CTE to calculate new access point groups and ensure uniqueness
WITH ticket_access_points_mapped AS (
  SELECT DISTINCT
    system_user_id,
    'TICKET' as dashboard_type,
    NULL as order_type,
    CASE
      -- Map old access point groups to new ones
      WHEN access_point_group = 'TICKET_VIEW' THEN 'TICKET_VIEW'
      WHEN access_point_group = 'TICKET_ACTIONS' THEN 'TICKET_ACTIONS'
      -- Map based on dashboard type context
      WHEN dashboard_type LIKE 'TICKET_%FOOD%' OR dashboard_type LIKE 'TICKET_%PARCEL%' OR dashboard_type LIKE 'TICKET_%PERSON_RIDE%' THEN 'TICKET_ORDER_RELATED'
      WHEN dashboard_type LIKE 'TICKET_%GENERAL%' THEN 'TICKET_NON_ORDER'
      WHEN dashboard_type LIKE 'TICKET_MERCHANT%' THEN 'TICKET_MERCHANT_SECTION'
      WHEN dashboard_type LIKE 'TICKET_CUSTOMER%' THEN 'TICKET_CUSTOMER_SECTION'
      WHEN dashboard_type LIKE 'TICKET_RIDER%' THEN 'TICKET_RIDER_SECTION'
      ELSE 'TICKET_VIEW'
    END as access_point_group,
    CASE
      WHEN access_point_group = 'TICKET_VIEW' THEN 'View Tickets'
      WHEN access_point_group = 'TICKET_ACTIONS' THEN 'Ticket Actions'
      WHEN dashboard_type LIKE 'TICKET_%FOOD%' OR dashboard_type LIKE 'TICKET_%PARCEL%' OR dashboard_type LIKE 'TICKET_%PERSON_RIDE%' THEN 'Order-Related Tickets'
      WHEN dashboard_type LIKE 'TICKET_%GENERAL%' THEN 'Non-Order Tickets'
      WHEN dashboard_type LIKE 'TICKET_MERCHANT%' THEN 'Merchant Section Tickets'
      WHEN dashboard_type LIKE 'TICKET_CUSTOMER%' THEN 'Customer Section Tickets'
      WHEN dashboard_type LIKE 'TICKET_RIDER%' THEN 'Rider Section Tickets'
      ELSE access_point_name
    END as access_point_name,
    CASE
      WHEN dashboard_type LIKE 'TICKET_%FOOD%' OR dashboard_type LIKE 'TICKET_%PARCEL%' OR dashboard_type LIKE 'TICKET_%PERSON_RIDE%' THEN 'Access to order-related tickets'
      WHEN dashboard_type LIKE 'TICKET_%GENERAL%' THEN 'Access to non-order-related tickets'
      WHEN dashboard_type LIKE 'TICKET_MERCHANT%' THEN 'Access to merchant section tickets'
      WHEN dashboard_type LIKE 'TICKET_CUSTOMER%' THEN 'Access to customer section tickets'
      WHEN dashboard_type LIKE 'TICKET_RIDER%' THEN 'Access to rider section tickets'
      ELSE access_point_description
    END as access_point_description,
    allowed_actions,
    jsonb_build_object(
      'migrated_from', dashboard_type,
      'original_group', access_point_group,
      'order_type', CASE
        WHEN dashboard_type LIKE '%FOOD%' THEN 'food'
        WHEN dashboard_type LIKE '%PARCEL%' THEN 'parcel'
        WHEN dashboard_type LIKE '%PERSON_RIDE%' THEN 'person_ride'
        ELSE NULL
      END,
      'section', CASE
        WHEN dashboard_type LIKE 'TICKET_MERCHANT%' THEN 'merchant'
        WHEN dashboard_type LIKE 'TICKET_CUSTOMER%' THEN 'customer'
        WHEN dashboard_type LIKE 'TICKET_RIDER%' THEN 'rider'
        ELSE 'other'
      END
    ) as context,
    is_active,
    granted_by,
    granted_by_name,
    granted_at
  FROM dashboard_access_points
  WHERE dashboard_type LIKE 'TICKET_%'
    AND dashboard_type != 'TICKET'
    AND is_active = TRUE
),
-- Deduplicate by taking the first record for each (system_user_id, access_point_group) combination
ticket_access_points_deduped AS (
  SELECT DISTINCT ON (system_user_id, access_point_group)
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
    granted_at
  FROM ticket_access_points_mapped
  ORDER BY system_user_id, access_point_group, granted_at DESC
)
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
  NOW() as created_at,
  NOW() as updated_at
FROM ticket_access_points_deduped
WHERE NOT EXISTS (
  SELECT 1 FROM dashboard_access_points dap2
  WHERE dap2.system_user_id = ticket_access_points_deduped.system_user_id
    AND dap2.dashboard_type = 'TICKET'
    AND dap2.access_point_group = ticket_access_points_deduped.access_point_group
    AND dap2.is_active = TRUE
);

-- ============================================================================
-- STEP 3: Update ORDER access points to new structure
-- ============================================================================

-- Migrate ORDER_CANCEL_ASSIGN to separate ORDER_ASSIGN and ORDER_CANCEL
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
SELECT DISTINCT
  system_user_id,
  dashboard_type,
  order_type,
  'ORDER_ASSIGN' as access_point_group,
  'Assign/Deassign Rider' as access_point_name,
  'Assign or deassign riders to orders' as access_point_description,
  to_jsonb(ARRAY['ASSIGN', 'UPDATE']::text[]) as allowed_actions,
  jsonb_build_object('migrated_from', 'ORDER_CANCEL_ASSIGN') as context,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  NOW() as created_at,
  NOW() as updated_at
FROM dashboard_access_points
WHERE access_point_group = 'ORDER_CANCEL_ASSIGN'
  AND dashboard_type IN ('ORDER_FOOD', 'ORDER_PARCEL', 'ORDER_PERSON_RIDE')
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access_points dap2
    WHERE dap2.system_user_id = dashboard_access_points.system_user_id
      AND dap2.dashboard_type = dashboard_access_points.dashboard_type
      AND dap2.access_point_group = 'ORDER_ASSIGN'
      AND dap2.is_active = TRUE
  );

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
SELECT DISTINCT
  system_user_id,
  dashboard_type,
  order_type,
  'ORDER_CANCEL' as access_point_group,
  'Cancel Orders' as access_point_name,
  'Cancel orders' as access_point_description,
  to_jsonb(ARRAY['CANCEL', 'UPDATE']::text[]) as allowed_actions,
  jsonb_build_object('migrated_from', 'ORDER_CANCEL_ASSIGN') as context,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  NOW() as created_at,
  NOW() as updated_at
FROM dashboard_access_points
WHERE access_point_group = 'ORDER_CANCEL_ASSIGN'
  AND dashboard_type IN ('ORDER_FOOD', 'ORDER_PARCEL', 'ORDER_PERSON_RIDE')
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access_points dap2
    WHERE dap2.system_user_id = dashboard_access_points.system_user_id
      AND dap2.dashboard_type = dashboard_access_points.dashboard_type
      AND dap2.access_point_group = 'ORDER_CANCEL'
      AND dap2.is_active = TRUE
  );

-- Migrate ORDER_REFUND_DELIVER to ORDER_REFUND
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
SELECT DISTINCT
  system_user_id,
  dashboard_type,
  order_type,
  'ORDER_REFUND' as access_point_group,
  'Process Refunds' as access_point_name,
  'Process refunds for orders' as access_point_description,
  to_jsonb(ARRAY['REFUND', 'UPDATE']::text[]) as allowed_actions,
  jsonb_build_object('migrated_from', 'ORDER_REFUND_DELIVER') as context,
  is_active,
  granted_by,
  granted_by_name,
  granted_at,
  NOW() as created_at,
  NOW() as updated_at
FROM dashboard_access_points
WHERE access_point_group = 'ORDER_REFUND_DELIVER'
  AND dashboard_type IN ('ORDER_FOOD', 'ORDER_PARCEL', 'ORDER_PERSON_RIDE')
  AND is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_access_points dap2
    WHERE dap2.system_user_id = dashboard_access_points.system_user_id
      AND dap2.dashboard_type = dashboard_access_points.dashboard_type
      AND dap2.access_point_group = 'ORDER_REFUND'
      AND dap2.is_active = TRUE
  );

-- ============================================================================
-- STEP 4: Archive old dashboard access records (mark as inactive)
-- ============================================================================

-- Archive old CUSTOMER_* dashboard access
UPDATE dashboard_access
SET is_active = false,
    revoked_at = NOW(),
    revoke_reason = 'Consolidated to CUSTOMER dashboard'
WHERE dashboard_type IN ('CUSTOMER_FOOD', 'CUSTOMER_PARCEL', 'CUSTOMER_PERSON_RIDE')
  AND is_active = TRUE;

UPDATE dashboard_access_points
SET is_active = false,
    revoked_at = NOW(),
    revoke_reason = 'Consolidated to CUSTOMER dashboard'
WHERE dashboard_type IN ('CUSTOMER_FOOD', 'CUSTOMER_PARCEL', 'CUSTOMER_PERSON_RIDE')
  AND is_active = TRUE;

-- Archive old TICKET_* dashboard access (except TICKET)
UPDATE dashboard_access
SET is_active = false,
    revoked_at = NOW(),
    revoke_reason = 'Consolidated to TICKET dashboard'
WHERE dashboard_type LIKE 'TICKET_%'
  AND dashboard_type != 'TICKET'
  AND is_active = TRUE;

UPDATE dashboard_access_points
SET is_active = false,
    revoked_at = NOW(),
    revoke_reason = 'Consolidated to TICKET dashboard'
WHERE dashboard_type LIKE 'TICKET_%'
  AND dashboard_type != 'TICKET'
  AND is_active = TRUE;

-- Archive old ORDER access point groups
UPDATE dashboard_access_points
SET is_active = false,
    revoked_at = NOW(),
    revoke_reason = 'Migrated to new access point structure'
WHERE access_point_group IN ('ORDER_CANCEL_ASSIGN', 'ORDER_REFUND_DELIVER')
  AND dashboard_type IN ('ORDER_FOOD', 'ORDER_PARCEL', 'ORDER_PERSON_RIDE')
  AND is_active = TRUE;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN dashboard_access.dashboard_type IS 
  'Dashboard type. CUSTOMER and TICKET are consolidated dashboards with granular access control via access points. ORDER_FOOD, ORDER_PARCEL, ORDER_PERSON_RIDE are separate dashboards.';

COMMENT ON COLUMN dashboard_access_points.access_point_group IS 
  'Access point group. For TICKET dashboard: TICKET_ORDER_RELATED, TICKET_NON_ORDER, TICKET_MERCHANT_SECTION, etc. For ORDER dashboards: ORDER_VIEW, ORDER_ASSIGN, ORDER_CANCEL, ORDER_REFUND.';
