-- Add Service-Based Access Control for RIDER, TICKET, and CUSTOMER Dashboards
-- Migration: 0053_add_service_based_access_control
-- Changes: Add service-specific access points using order_type column
--          Update unique constraint to include order_type for service-based dashboards
--          Migrate existing access points to new service-specific structure

-- ============================================================================
-- STEP 1: Drop and recreate unique constraint to include order_type
-- ============================================================================

-- Drop the existing unique constraint
-- PostgreSQL creates a unique index for UNIQUE constraints, so we need to drop both
DO $$ 
DECLARE
  constraint_exists BOOLEAN;
  index_exists BOOLEAN;
BEGIN
  -- Check if constraint exists
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'dashboard_access_points_system_user_id_dashboard_type_acces_key'
  ) INTO constraint_exists;
  
  IF constraint_exists THEN
    ALTER TABLE dashboard_access_points
      DROP CONSTRAINT dashboard_access_points_system_user_id_dashboard_type_acces_key;
  END IF;
  
  -- Check if index exists (PostgreSQL creates an index for UNIQUE constraints)
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'dashboard_access_points_system_user_id_dashboard_type_acces_key'
  ) INTO index_exists;
  
  IF index_exists THEN
    DROP INDEX dashboard_access_points_system_user_id_dashboard_type_acces_key;
  END IF;
END $$;

-- Create a new unique index that includes order_type
-- For dashboards that use order_type (RIDER, TICKET, CUSTOMER), order_type must be included
-- For other dashboards, order_type is NULL and doesn't affect uniqueness
-- PostgreSQL treats NULL values as distinct in unique indexes, so multiple NULLs are allowed
DROP INDEX IF EXISTS dashboard_access_points_unique_idx;
CREATE UNIQUE INDEX dashboard_access_points_unique_idx
  ON dashboard_access_points(system_user_id, dashboard_type, access_point_group, order_type)
  WHERE is_active = TRUE;

-- ============================================================================
-- STEP 2: Migrate RIDER access points to service-specific structure
-- ============================================================================

-- RIDER_VIEW remains global (order_type = NULL)
-- RIDER_ACTIONS becomes service-specific

-- Create service-specific action access points from existing RIDER_ACTIONS
WITH rider_actions_food_mapped AS (
  SELECT DISTINCT ON (system_user_id)
    system_user_id,
    dashboard_type,
    'food' as order_type,
    'RIDER_ACTIONS_FOOD' as access_point_group,
    'Rider Actions (Food)' as access_point_name,
    'Actions for food orders: cancel ride, assign, penalty, blacklist/whitelist, wallet, deactivate' as access_point_description,
    allowed_actions,
    jsonb_build_object(
      'migrated_from', 'RIDER_ACTIONS',
      'service_type', 'food'
    ) as context,
    is_active,
    granted_by,
    granted_by_name,
    granted_at
  FROM dashboard_access_points
  WHERE dashboard_type = 'RIDER'
    AND access_point_group = 'RIDER_ACTIONS'
    AND is_active = TRUE
  ORDER BY system_user_id, granted_at DESC
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
FROM rider_actions_food_mapped
WHERE NOT EXISTS (
  SELECT 1 FROM dashboard_access_points dap2
  WHERE dap2.system_user_id = rider_actions_food_mapped.system_user_id
    AND dap2.dashboard_type = 'RIDER'
    AND dap2.access_point_group = 'RIDER_ACTIONS_FOOD'
    AND dap2.order_type = 'food'
    AND dap2.is_active = TRUE
);

WITH rider_actions_parcel_mapped AS (
  SELECT DISTINCT ON (system_user_id)
    system_user_id,
    dashboard_type,
    'parcel' as order_type,
    'RIDER_ACTIONS_PARCEL' as access_point_group,
    'Rider Actions (Parcel)' as access_point_name,
    'Actions for parcel orders: cancel ride, assign, penalty, blacklist/whitelist, wallet, deactivate' as access_point_description,
    allowed_actions,
    jsonb_build_object(
      'migrated_from', 'RIDER_ACTIONS',
      'service_type', 'parcel'
    ) as context,
    is_active,
    granted_by,
    granted_by_name,
    granted_at
  FROM dashboard_access_points
  WHERE dashboard_type = 'RIDER'
    AND access_point_group = 'RIDER_ACTIONS'
    AND is_active = TRUE
  ORDER BY system_user_id, granted_at DESC
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
FROM rider_actions_parcel_mapped
WHERE NOT EXISTS (
  SELECT 1 FROM dashboard_access_points dap2
  WHERE dap2.system_user_id = rider_actions_parcel_mapped.system_user_id
    AND dap2.dashboard_type = 'RIDER'
    AND dap2.access_point_group = 'RIDER_ACTIONS_PARCEL'
    AND dap2.order_type = 'parcel'
    AND dap2.is_active = TRUE
);

WITH rider_actions_person_ride_mapped AS (
  SELECT DISTINCT ON (system_user_id)
    system_user_id,
    dashboard_type,
    'person_ride' as order_type,
    'RIDER_ACTIONS_PERSON_RIDE' as access_point_group,
    'Rider Actions (Person Ride)' as access_point_name,
    'Actions for person ride orders: cancel ride, assign, penalty, blacklist/whitelist, wallet, deactivate' as access_point_description,
    allowed_actions,
    jsonb_build_object(
      'migrated_from', 'RIDER_ACTIONS',
      'service_type', 'person_ride'
    ) as context,
    is_active,
    granted_by,
    granted_by_name,
    granted_at
  FROM dashboard_access_points
  WHERE dashboard_type = 'RIDER'
    AND access_point_group = 'RIDER_ACTIONS'
    AND is_active = TRUE
  ORDER BY system_user_id, granted_at DESC
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
FROM rider_actions_person_ride_mapped
WHERE NOT EXISTS (
  SELECT 1 FROM dashboard_access_points dap2
  WHERE dap2.system_user_id = rider_actions_person_ride_mapped.system_user_id
    AND dap2.dashboard_type = 'RIDER'
    AND dap2.access_point_group = 'RIDER_ACTIONS_PERSON_RIDE'
    AND dap2.order_type = 'person_ride'
    AND dap2.is_active = TRUE
);

-- ============================================================================
-- STEP 3: Migrate CUSTOMER access points to service-specific structure
-- ============================================================================

-- CUSTOMER_VIEW remains global (order_type = NULL)
-- CUSTOMER_ACTIONS becomes service-specific

WITH customer_actions_food_mapped AS (
  SELECT DISTINCT ON (system_user_id)
    system_user_id,
    dashboard_type,
    'food' as order_type,
    'CUSTOMER_ACTIONS_FOOD' as access_point_group,
    'Customer Actions (Food)' as access_point_name,
    'Actions for food customers: block, suspend, activate' as access_point_description,
    allowed_actions,
    jsonb_build_object(
      'migrated_from', 'CUSTOMER_ACTIONS',
      'service_type', 'food'
    ) as context,
    is_active,
    granted_by,
    granted_by_name,
    granted_at
  FROM dashboard_access_points
  WHERE dashboard_type = 'CUSTOMER'
    AND access_point_group = 'CUSTOMER_ACTIONS'
    AND is_active = TRUE
  ORDER BY system_user_id, granted_at DESC
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
FROM customer_actions_food_mapped
WHERE NOT EXISTS (
  SELECT 1 FROM dashboard_access_points dap2
  WHERE dap2.system_user_id = customer_actions_food_mapped.system_user_id
    AND dap2.dashboard_type = 'CUSTOMER'
    AND dap2.access_point_group = 'CUSTOMER_ACTIONS_FOOD'
    AND dap2.order_type = 'food'
    AND dap2.is_active = TRUE
);

WITH customer_actions_parcel_mapped AS (
  SELECT DISTINCT ON (system_user_id)
    system_user_id,
    dashboard_type,
    'parcel' as order_type,
    'CUSTOMER_ACTIONS_PARCEL' as access_point_group,
    'Customer Actions (Parcel)' as access_point_name,
    'Actions for parcel customers: block, suspend, activate' as access_point_description,
    allowed_actions,
    jsonb_build_object(
      'migrated_from', 'CUSTOMER_ACTIONS',
      'service_type', 'parcel'
    ) as context,
    is_active,
    granted_by,
    granted_by_name,
    granted_at
  FROM dashboard_access_points
  WHERE dashboard_type = 'CUSTOMER'
    AND access_point_group = 'CUSTOMER_ACTIONS'
    AND is_active = TRUE
  ORDER BY system_user_id, granted_at DESC
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
FROM customer_actions_parcel_mapped
WHERE NOT EXISTS (
  SELECT 1 FROM dashboard_access_points dap2
  WHERE dap2.system_user_id = customer_actions_parcel_mapped.system_user_id
    AND dap2.dashboard_type = 'CUSTOMER'
    AND dap2.access_point_group = 'CUSTOMER_ACTIONS_PARCEL'
    AND dap2.order_type = 'parcel'
    AND dap2.is_active = TRUE
);

WITH customer_actions_person_ride_mapped AS (
  SELECT DISTINCT ON (system_user_id)
    system_user_id,
    dashboard_type,
    'person_ride' as order_type,
    'CUSTOMER_ACTIONS_PERSON_RIDE' as access_point_group,
    'Customer Actions (Person Ride)' as access_point_name,
    'Actions for person ride customers: block, suspend, activate' as access_point_description,
    allowed_actions,
    jsonb_build_object(
      'migrated_from', 'CUSTOMER_ACTIONS',
      'service_type', 'person_ride'
    ) as context,
    is_active,
    granted_by,
    granted_by_name,
    granted_at
  FROM dashboard_access_points
  WHERE dashboard_type = 'CUSTOMER'
    AND access_point_group = 'CUSTOMER_ACTIONS'
    AND is_active = TRUE
  ORDER BY system_user_id, granted_at DESC
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
FROM customer_actions_person_ride_mapped
WHERE NOT EXISTS (
  SELECT 1 FROM dashboard_access_points dap2
  WHERE dap2.system_user_id = customer_actions_person_ride_mapped.system_user_id
    AND dap2.dashboard_type = 'CUSTOMER'
    AND dap2.access_point_group = 'CUSTOMER_ACTIONS_PERSON_RIDE'
    AND dap2.order_type = 'person_ride'
    AND dap2.is_active = TRUE
);

-- ============================================================================
-- STEP 4: Migrate TICKET access points to service-specific structure
-- ============================================================================

-- Remove old TICKET access points and create new service-specific ones
-- TICKET_VIEW becomes service-specific: TICKET_VIEW_FOOD, TICKET_VIEW_PARCEL, TICKET_VIEW_PERSON_RIDE
-- TICKET_ACTIONS becomes service-specific: TICKET_ACTIONS_FOOD, TICKET_ACTIONS_PARCEL, TICKET_ACTIONS_PERSON_RIDE

-- Migrate TICKET_VIEW to service-specific views
-- Use DISTINCT ON to ensure one record per user
WITH ticket_view_food_mapped AS (
  SELECT DISTINCT ON (system_user_id)
    system_user_id,
    dashboard_type,
    'food' as order_type,
    'TICKET_VIEW_FOOD' as access_point_group,
    'View Food Tickets' as access_point_name,
    'View tickets for food orders (customer, rider, merchant tickets)' as access_point_description,
    to_jsonb(ARRAY['VIEW']::text[]) as allowed_actions,
    jsonb_build_object(
      'migrated_from', 'TICKET_VIEW',
      'service_type', 'food',
      'sources', ARRAY['customer', 'rider', 'merchant']::text[]
    ) as context,
    is_active,
    granted_by,
    granted_by_name,
    granted_at
  FROM dashboard_access_points
  WHERE dashboard_type = 'TICKET'
    AND access_point_group IN ('TICKET_VIEW', 'TICKET_ORDER_RELATED', 'TICKET_NON_ORDER', 'TICKET_MERCHANT_SECTION', 'TICKET_CUSTOMER_SECTION', 'TICKET_RIDER_SECTION')
    AND is_active = TRUE
  ORDER BY system_user_id, granted_at DESC
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
FROM ticket_view_food_mapped
WHERE NOT EXISTS (
  SELECT 1 FROM dashboard_access_points dap2
  WHERE dap2.system_user_id = ticket_view_food_mapped.system_user_id
    AND dap2.dashboard_type = 'TICKET'
    AND dap2.access_point_group = 'TICKET_VIEW_FOOD'
    AND dap2.order_type = 'food'
    AND dap2.is_active = TRUE
);

WITH ticket_view_parcel_mapped AS (
  SELECT DISTINCT ON (system_user_id)
    system_user_id,
    dashboard_type,
    'parcel' as order_type,
    'TICKET_VIEW_PARCEL' as access_point_group,
    'View Parcel Tickets' as access_point_name,
    'View tickets for parcel orders (customer pickup, customer drop, rider tickets)' as access_point_description,
    to_jsonb(ARRAY['VIEW']::text[]) as allowed_actions,
    jsonb_build_object(
      'migrated_from', 'TICKET_VIEW',
      'service_type', 'parcel',
      'sources', ARRAY['customer_pickup', 'customer_drop', 'rider']::text[]
    ) as context,
    is_active,
    granted_by,
    granted_by_name,
    granted_at
  FROM dashboard_access_points
  WHERE dashboard_type = 'TICKET'
    AND access_point_group IN ('TICKET_VIEW', 'TICKET_ORDER_RELATED', 'TICKET_NON_ORDER', 'TICKET_CUSTOMER_SECTION', 'TICKET_RIDER_SECTION')
    AND is_active = TRUE
  ORDER BY system_user_id, granted_at DESC
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
FROM ticket_view_parcel_mapped
WHERE NOT EXISTS (
  SELECT 1 FROM dashboard_access_points dap2
  WHERE dap2.system_user_id = ticket_view_parcel_mapped.system_user_id
    AND dap2.dashboard_type = 'TICKET'
    AND dap2.access_point_group = 'TICKET_VIEW_PARCEL'
    AND dap2.order_type = 'parcel'
    AND dap2.is_active = TRUE
);

WITH ticket_view_person_ride_mapped AS (
  SELECT DISTINCT ON (system_user_id)
    system_user_id,
    dashboard_type,
    'person_ride' as order_type,
    'TICKET_VIEW_PERSON_RIDE' as access_point_group,
    'View Person Ride Tickets' as access_point_name,
    'View tickets for person ride orders (customer pickup, customer drop, rider tickets)' as access_point_description,
    to_jsonb(ARRAY['VIEW']::text[]) as allowed_actions,
    jsonb_build_object(
      'migrated_from', 'TICKET_VIEW',
      'service_type', 'person_ride',
      'sources', ARRAY['customer_pickup', 'customer_drop', 'rider']::text[]
    ) as context,
    is_active,
    granted_by,
    granted_by_name,
    granted_at
  FROM dashboard_access_points
  WHERE dashboard_type = 'TICKET'
    AND access_point_group IN ('TICKET_VIEW', 'TICKET_ORDER_RELATED', 'TICKET_NON_ORDER', 'TICKET_CUSTOMER_SECTION', 'TICKET_RIDER_SECTION')
    AND is_active = TRUE
  ORDER BY system_user_id, granted_at DESC
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
FROM ticket_view_person_ride_mapped
WHERE NOT EXISTS (
  SELECT 1 FROM dashboard_access_points dap2
  WHERE dap2.system_user_id = ticket_view_person_ride_mapped.system_user_id
    AND dap2.dashboard_type = 'TICKET'
    AND dap2.access_point_group = 'TICKET_VIEW_PERSON_RIDE'
    AND dap2.order_type = 'person_ride'
    AND dap2.is_active = TRUE
);

-- Migrate TICKET_ACTIONS to service-specific actions
WITH ticket_actions_food_mapped AS (
  SELECT DISTINCT ON (system_user_id)
    system_user_id,
    dashboard_type,
    'food' as order_type,
    'TICKET_ACTIONS_FOOD' as access_point_group,
    'Food Ticket Actions' as access_point_name,
    'Perform actions on food tickets: resolve, close, reply, assign' as access_point_description,
    to_jsonb(ARRAY['ASSIGN', 'UPDATE', 'APPROVE', 'REJECT']::text[]) as allowed_actions,
    jsonb_build_object(
      'migrated_from', 'TICKET_ACTIONS',
      'service_type', 'food'
    ) as context,
    is_active,
    granted_by,
    granted_by_name,
    granted_at
  FROM dashboard_access_points
  WHERE dashboard_type = 'TICKET'
    AND access_point_group = 'TICKET_ACTIONS'
    AND is_active = TRUE
  ORDER BY system_user_id, granted_at DESC
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
FROM ticket_actions_food_mapped
WHERE NOT EXISTS (
  SELECT 1 FROM dashboard_access_points dap2
  WHERE dap2.system_user_id = ticket_actions_food_mapped.system_user_id
    AND dap2.dashboard_type = 'TICKET'
    AND dap2.access_point_group = 'TICKET_ACTIONS_FOOD'
    AND dap2.order_type = 'food'
    AND dap2.is_active = TRUE
);

WITH ticket_actions_parcel_mapped AS (
  SELECT DISTINCT ON (system_user_id)
    system_user_id,
    dashboard_type,
    'parcel' as order_type,
    'TICKET_ACTIONS_PARCEL' as access_point_group,
    'Parcel Ticket Actions' as access_point_name,
    'Perform actions on parcel tickets: resolve, close, reply, assign' as access_point_description,
    to_jsonb(ARRAY['ASSIGN', 'UPDATE', 'APPROVE', 'REJECT']::text[]) as allowed_actions,
    jsonb_build_object(
      'migrated_from', 'TICKET_ACTIONS',
      'service_type', 'parcel'
    ) as context,
    is_active,
    granted_by,
    granted_by_name,
    granted_at
  FROM dashboard_access_points
  WHERE dashboard_type = 'TICKET'
    AND access_point_group = 'TICKET_ACTIONS'
    AND is_active = TRUE
  ORDER BY system_user_id, granted_at DESC
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
FROM ticket_actions_parcel_mapped
WHERE NOT EXISTS (
  SELECT 1 FROM dashboard_access_points dap2
  WHERE dap2.system_user_id = ticket_actions_parcel_mapped.system_user_id
    AND dap2.dashboard_type = 'TICKET'
    AND dap2.access_point_group = 'TICKET_ACTIONS_PARCEL'
    AND dap2.order_type = 'parcel'
    AND dap2.is_active = TRUE
);

WITH ticket_actions_person_ride_mapped AS (
  SELECT DISTINCT ON (system_user_id)
    system_user_id,
    dashboard_type,
    'person_ride' as order_type,
    'TICKET_ACTIONS_PERSON_RIDE' as access_point_group,
    'Person Ride Ticket Actions' as access_point_name,
    'Perform actions on person ride tickets: resolve, close, reply, assign' as access_point_description,
    to_jsonb(ARRAY['ASSIGN', 'UPDATE', 'APPROVE', 'REJECT']::text[]) as allowed_actions,
    jsonb_build_object(
      'migrated_from', 'TICKET_ACTIONS',
      'service_type', 'person_ride'
    ) as context,
    is_active,
    granted_by,
    granted_by_name,
    granted_at
  FROM dashboard_access_points
  WHERE dashboard_type = 'TICKET'
    AND access_point_group = 'TICKET_ACTIONS'
    AND is_active = TRUE
  ORDER BY system_user_id, granted_at DESC
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
FROM ticket_actions_person_ride_mapped
WHERE NOT EXISTS (
  SELECT 1 FROM dashboard_access_points dap2
  WHERE dap2.system_user_id = ticket_actions_person_ride_mapped.system_user_id
    AND dap2.dashboard_type = 'TICKET'
    AND dap2.access_point_group = 'TICKET_ACTIONS_PERSON_RIDE'
    AND dap2.order_type = 'person_ride'
    AND dap2.is_active = TRUE
);

-- ============================================================================
-- STEP 5: Archive old access point groups
-- ============================================================================

-- Archive old RIDER_ACTIONS (replaced by service-specific ones)
UPDATE dashboard_access_points
SET is_active = false,
    revoked_at = NOW(),
    revoke_reason = 'Migrated to service-specific access points (RIDER_ACTIONS_FOOD, RIDER_ACTIONS_PARCEL, RIDER_ACTIONS_PERSON_RIDE)'
WHERE dashboard_type = 'RIDER'
  AND access_point_group = 'RIDER_ACTIONS'
  AND is_active = TRUE;

-- Archive old CUSTOMER_ACTIONS (replaced by service-specific ones)
UPDATE dashboard_access_points
SET is_active = false,
    revoked_at = NOW(),
    revoke_reason = 'Migrated to service-specific access points (CUSTOMER_ACTIONS_FOOD, CUSTOMER_ACTIONS_PARCEL, CUSTOMER_ACTIONS_PERSON_RIDE)'
WHERE dashboard_type = 'CUSTOMER'
  AND access_point_group = 'CUSTOMER_ACTIONS'
  AND is_active = TRUE;

-- Archive old TICKET access points (replaced by service-specific ones)
UPDATE dashboard_access_points
SET is_active = false,
    revoked_at = NOW(),
    revoke_reason = 'Migrated to service-specific access points (TICKET_VIEW_FOOD, TICKET_VIEW_PARCEL, TICKET_VIEW_PERSON_RIDE, TICKET_ACTIONS_FOOD, TICKET_ACTIONS_PARCEL, TICKET_ACTIONS_PERSON_RIDE)'
WHERE dashboard_type = 'TICKET'
  AND access_point_group IN (
    'TICKET_VIEW',
    'TICKET_ORDER_RELATED',
    'TICKET_NON_ORDER',
    'TICKET_MERCHANT_SECTION',
    'TICKET_CUSTOMER_SECTION',
    'TICKET_RIDER_SECTION',
    'TICKET_OTHER_SECTION',
    'TICKET_ACTIONS',
    'TICKET_VIEW_ONLY'
  )
  AND is_active = TRUE;

-- ============================================================================
-- STEP 6: Create indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS dashboard_access_points_service_type_idx
  ON dashboard_access_points(dashboard_type, order_type, access_point_group)
  WHERE order_type IS NOT NULL AND is_active = TRUE;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN dashboard_access_points.order_type IS 
  'Service type (food, parcel, person_ride) for service-specific access control. NULL for global access points (e.g., RIDER_VIEW, CUSTOMER_VIEW). Used for RIDER, TICKET, and CUSTOMER dashboards.';

COMMENT ON INDEX dashboard_access_points_unique_idx IS 
  'Unique constraint ensuring one active access point per (user, dashboard, access_point_group, service_type) combination.';
