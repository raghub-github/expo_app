-- ============================================================================
-- ACCESS MANAGEMENT - Triggers, Defaults & Integration
-- Migration: 0018_access_triggers_and_defaults
-- Database: Supabase PostgreSQL
-- ============================================================================

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Auto-update updated_at
DROP TRIGGER IF EXISTS system_users_updated_at_trigger ON system_users;
CREATE TRIGGER system_users_updated_at_trigger
  BEFORE UPDATE ON system_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS system_roles_updated_at_trigger ON system_roles;
CREATE TRIGGER system_roles_updated_at_trigger
  BEFORE UPDATE ON system_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS system_permissions_updated_at_trigger ON system_permissions;
CREATE TRIGGER system_permissions_updated_at_trigger
  BEFORE UPDATE ON system_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Create audit log on permission change
CREATE OR REPLACE FUNCTION create_permission_change_log()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO permission_change_logs (
    target_user_id, target_user_name, change_type,
    role_id, changed_by, created_at
  ) VALUES (
    NEW.system_user_id,
    (SELECT full_name FROM system_users WHERE id = NEW.system_user_id),
    CASE 
      WHEN TG_OP = 'INSERT' THEN 'ROLE_ASSIGNED'
      WHEN TG_OP = 'DELETE' THEN 'ROLE_REVOKED'
      ELSE 'ROLE_UPDATED'
    END,
    NEW.role_id,
    NEW.assigned_by,
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_roles_change_log_trigger ON user_roles;
CREATE TRIGGER user_roles_change_log_trigger
  AFTER INSERT OR UPDATE OR DELETE ON user_roles
  FOR EACH ROW
  EXECUTE FUNCTION create_permission_change_log();

-- Trigger: Log system audit entry
CREATE OR REPLACE FUNCTION create_system_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  -- This trigger can be attached to critical tables
  -- For now, it's a placeholder for application-level audit logging
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function: Check if user has permission
CREATE OR REPLACE FUNCTION check_user_permission(
  p_user_id BIGINT,
  p_module access_module,
  p_action permission_action,
  p_service service_type DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_has_permission BOOLEAN := FALSE;
  v_user_status TEXT;
BEGIN
  -- Check if user is active
  SELECT status INTO v_user_status FROM system_users WHERE id = p_user_id;
  IF v_user_status != 'ACTIVE' THEN
    RETURN FALSE;
  END IF;
  
  -- Check via roles
  SELECT EXISTS(
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN system_permissions sp ON rp.permission_id = sp.id
    WHERE ur.system_user_id = p_user_id
      AND ur.is_active = TRUE
      AND sp.module_name = p_module
      AND sp.action = p_action
      AND (rp.service_scope IS NULL OR p_service = ANY(rp.service_scope))
  ) INTO v_has_permission;
  
  IF v_has_permission THEN
    RETURN TRUE;
  END IF;
  
  -- Check via permission overrides
  SELECT EXISTS(
    SELECT 1
    FROM user_permission_overrides upo
    JOIN system_permissions sp ON upo.permission_id = sp.id
    WHERE upo.system_user_id = p_user_id
      AND upo.is_active = TRUE
      AND upo.is_allowed = TRUE
      AND sp.module_name = p_module
      AND sp.action = p_action
      AND (upo.service_scope IS NULL OR p_service = ANY(upo.service_scope))
  ) INTO v_has_permission;
  
  RETURN v_has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get user permissions
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id BIGINT)
RETURNS TABLE (
  permission_id TEXT,
  module_name access_module,
  action permission_action,
  service_scope service_type[]
) AS $$
BEGIN
  RETURN QUERY
  -- From roles
  SELECT DISTINCT
    sp.permission_id,
    sp.module_name,
    sp.action,
    rp.service_scope
  FROM user_roles ur
  JOIN role_permissions rp ON ur.role_id = rp.role_id
  JOIN system_permissions sp ON rp.permission_id = sp.id
  WHERE ur.system_user_id = p_user_id
    AND ur.is_active = TRUE
    AND rp.is_active = TRUE
  
  UNION
  
  -- From overrides (only grants)
  SELECT DISTINCT
    sp.permission_id,
    sp.module_name,
    sp.action,
    upo.service_scope
  FROM user_permission_overrides upo
  JOIN system_permissions sp ON upo.permission_id = sp.id
  WHERE upo.system_user_id = p_user_id
    AND upo.is_active = TRUE
    AND upo.is_allowed = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get user's accessible areas
CREATE OR REPLACE FUNCTION get_user_areas(p_user_id BIGINT)
RETURNS TABLE (
  area_code TEXT,
  area_name TEXT,
  service_type service_type
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    aa.area_code,
    aa.area_name,
    aa.service_type
  FROM area_assignments aa
  WHERE aa.system_user_id = p_user_id
    AND aa.is_active = TRUE
    AND (aa.valid_until IS NULL OR aa.valid_until > NOW())
  ORDER BY aa.area_type, aa.area_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- DEFAULT ROLES & PERMISSIONS
-- ============================================================================

-- Insert default roles (idempotent)
INSERT INTO system_roles (role_id, role_name, role_display_name, role_type, role_level, is_system_role) VALUES
  ('SUPER_ADMIN', 'SUPER_ADMIN', 'Super Administrator', 'SUPER_ADMIN', 1, TRUE),
  ('ADMIN', 'ADMIN', 'Administrator', 'ADMIN', 2, TRUE),
  ('AGENT', 'AGENT', 'Agent', 'AGENT', 3, TRUE),
  ('AREA_MGR_MERCHANT', 'AREA_MANAGER_MERCHANT', 'Area Manager (Merchant)', 'AREA_MANAGER_MERCHANT', 3, TRUE),
  ('AREA_MGR_RIDER', 'AREA_MANAGER_RIDER', 'Area Manager (Rider)', 'AREA_MANAGER_RIDER', 3, TRUE),
  ('SALES', 'SALES_TEAM', 'Sales Team', 'SALES_TEAM', 4, TRUE),
  ('ADS', 'ADVERTISEMENT_TEAM', 'Advertisement Team', 'ADVERTISEMENT_TEAM', 4, TRUE),
  ('AUDIT', 'AUDIT_TEAM', 'Audit Team', 'AUDIT_TEAM', 2, TRUE),
  ('COMPLIANCE', 'COMPLIANCE_TEAM', 'Compliance Team', 'COMPLIANCE_TEAM', 2, TRUE),
  ('SUPPORT_L1', 'SUPPORT_L1', 'Support Level 1', 'SUPPORT_L1', 5, TRUE),
  ('SUPPORT_L2', 'SUPPORT_L2', 'Support Level 2', 'SUPPORT_L2', 4, TRUE),
  ('SUPPORT_L3', 'SUPPORT_L3', 'Support Level 3', 'SUPPORT_L3', 3, TRUE),
  ('FINANCE', 'FINANCE_TEAM', 'Finance Team', 'FINANCE_TEAM', 3, TRUE),
  ('OPERATIONS', 'OPERATIONS_TEAM', 'Operations Team', 'OPERATIONS_TEAM', 3, TRUE),
  ('DEVELOPER', 'DEVELOPER', 'Developer', 'DEVELOPER', 4, TRUE),
  ('READ_ONLY', 'READ_ONLY', 'Read Only Access', 'READ_ONLY', 6, TRUE)
ON CONFLICT (role_id) DO UPDATE SET
  role_display_name = EXCLUDED.role_display_name,
  role_type = EXCLUDED.role_type,
  role_level = EXCLUDED.role_level,
  is_system_role = EXCLUDED.is_system_role;

-- Insert core permissions (idempotent - using individual INSERTs to avoid duplicate conflict)
-- Note: Some permissions share the same (module_name, action, resource_type) but have different permission_id
-- We use WHERE NOT EXISTS to handle this properly

-- Orders - View
INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'ORDERS_VIEW', 'orders.view', 'View Orders', 'ORDERS', 'VIEW', 'ORDER', 'LOW'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'ORDERS' AND action = 'VIEW' AND resource_type = 'ORDER'
);

-- Note: ORDERS_VIEW_FINANCIAL has same (module_name, action, resource_type) as ORDERS_VIEW
-- Skip it to avoid unique constraint violation, or update existing if needed
-- INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
-- SELECT 'ORDERS_VIEW_FINANCIAL', 'orders.view.financial', 'View Order Financial Details', 'ORDERS', 'VIEW', 'ORDER', 'MEDIUM'
-- WHERE NOT EXISTS (
--   SELECT 1 FROM system_permissions 
--   WHERE module_name = 'ORDERS' AND action = 'VIEW' AND resource_type = 'ORDER'
-- );

-- Orders - Create/Update
INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'ORDERS_CREATE', 'orders.create', 'Create Order', 'ORDERS', 'CREATE', 'ORDER', 'MEDIUM'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'ORDERS' AND action = 'CREATE' AND resource_type = 'ORDER'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'ORDERS_UPDATE', 'orders.update', 'Update Order', 'ORDERS', 'UPDATE', 'ORDER', 'MEDIUM'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'ORDERS' AND action = 'UPDATE' AND resource_type = 'ORDER'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'ORDERS_CANCEL', 'orders.cancel', 'Cancel Order', 'ORDERS', 'CANCEL', 'ORDER', 'HIGH'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'ORDERS' AND action = 'CANCEL' AND resource_type = 'ORDER'
);

-- Orders - Assignment
INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'ORDERS_ASSIGN_RIDER', 'orders.assign.rider', 'Assign Rider to Order', 'ORDERS', 'ASSIGN', 'ORDER', 'MEDIUM'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'ORDERS' AND action = 'ASSIGN' AND resource_type = 'ORDER'
);

-- Note: ORDERS_REASSIGN_RIDER has same (module_name, action, resource_type) as ORDERS_ASSIGN_RIDER
-- Skip it to avoid unique constraint violation
-- INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
-- SELECT 'ORDERS_REASSIGN_RIDER', 'orders.reassign.rider', 'Reassign Rider', 'ORDERS', 'ASSIGN', 'ORDER', 'HIGH'
-- WHERE NOT EXISTS (
--   SELECT 1 FROM system_permissions 
--   WHERE module_name = 'ORDERS' AND action = 'ASSIGN' AND resource_type = 'ORDER'
-- );

-- Note: ORDERS_OVERRIDE_STATUS has same (module_name, action, resource_type) as ORDERS_UPDATE
-- Skip it to avoid unique constraint violation
-- INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
-- SELECT 'ORDERS_OVERRIDE_STATUS', 'orders.override.status', 'Override Order Status', 'ORDERS', 'UPDATE', 'ORDER', 'CRITICAL'
-- WHERE NOT EXISTS (
--   SELECT 1 FROM system_permissions 
--   WHERE module_name = 'ORDERS' AND action = 'UPDATE' AND resource_type = 'ORDER'
-- );

-- Orders - Financial
INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'ORDERS_REFUND', 'orders.refund', 'Process Order Refund', 'ORDERS', 'REFUND', 'ORDER', 'HIGH'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'ORDERS' AND action = 'REFUND' AND resource_type = 'ORDER'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'ORDERS_APPROVE_REFUND', 'orders.approve.refund', 'Approve Refund', 'ORDERS', 'APPROVE', 'ORDER', 'CRITICAL'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'ORDERS' AND action = 'APPROVE' AND resource_type = 'ORDER'
);

-- Tickets - View/Update
INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'TICKETS_VIEW', 'tickets.view', 'View Tickets', 'TICKETS', 'VIEW', 'TICKET', 'LOW'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'TICKETS' AND action = 'VIEW' AND resource_type = 'TICKET'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'TICKETS_CREATE', 'tickets.create', 'Create Ticket', 'TICKETS', 'CREATE', 'TICKET', 'LOW'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'TICKETS' AND action = 'CREATE' AND resource_type = 'TICKET'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'TICKETS_UPDATE', 'tickets.update', 'Update Ticket', 'TICKETS', 'UPDATE', 'TICKET', 'LOW'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'TICKETS' AND action = 'UPDATE' AND resource_type = 'TICKET'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'TICKETS_ASSIGN', 'tickets.assign', 'Assign Ticket', 'TICKETS', 'ASSIGN', 'TICKET', 'MEDIUM'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'TICKETS' AND action = 'ASSIGN' AND resource_type = 'TICKET'
);

-- Note: TICKETS_CLOSE has same (module_name, action, resource_type) as TICKETS_UPDATE
-- Skip it to avoid unique constraint violation
-- INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
-- SELECT 'TICKETS_CLOSE', 'tickets.close', 'Close Ticket', 'TICKETS', 'UPDATE', 'TICKET', 'MEDIUM'
-- WHERE NOT EXISTS (
--   SELECT 1 FROM system_permissions 
--   WHERE module_name = 'TICKETS' AND action = 'UPDATE' AND resource_type = 'TICKET'
-- );

-- Riders - View/Manage
INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'RIDERS_VIEW', 'riders.view', 'View Riders', 'RIDERS', 'VIEW', 'RIDER', 'LOW'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'RIDERS' AND action = 'VIEW' AND resource_type = 'RIDER'
);

-- Note: RIDERS_VIEW_FINANCIAL has same (module_name, action, resource_type) as RIDERS_VIEW
-- Skip it to avoid unique constraint violation
-- INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
-- SELECT 'RIDERS_VIEW_FINANCIAL', 'riders.view.financial', 'View Rider Financial', 'RIDERS', 'VIEW', 'RIDER', 'MEDIUM'
-- WHERE NOT EXISTS (
--   SELECT 1 FROM system_permissions 
--   WHERE module_name = 'RIDERS' AND action = 'VIEW' AND resource_type = 'RIDER'
-- );

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'RIDERS_UPDATE', 'riders.update', 'Update Rider Details', 'RIDERS', 'UPDATE', 'RIDER', 'MEDIUM'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'RIDERS' AND action = 'UPDATE' AND resource_type = 'RIDER'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'RIDERS_APPROVE', 'riders.approve', 'Approve Rider', 'RIDERS', 'APPROVE', 'RIDER', 'HIGH'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'RIDERS' AND action = 'APPROVE' AND resource_type = 'RIDER'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'RIDERS_REJECT', 'riders.reject', 'Reject Rider', 'RIDERS', 'REJECT', 'RIDER', 'HIGH'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'RIDERS' AND action = 'REJECT' AND resource_type = 'RIDER'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'RIDERS_BLOCK', 'riders.block', 'Block Rider', 'RIDERS', 'BLOCK', 'RIDER', 'CRITICAL'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'RIDERS' AND action = 'BLOCK' AND resource_type = 'RIDER'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'RIDERS_UNBLOCK', 'riders.unblock', 'Unblock Rider', 'RIDERS', 'UNBLOCK', 'RIDER', 'CRITICAL'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'RIDERS' AND action = 'UNBLOCK' AND resource_type = 'RIDER'
);

-- Merchants - View/Manage
INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'MERCHANTS_VIEW', 'merchants.view', 'View Merchants', 'MERCHANTS', 'VIEW', 'MERCHANT', 'LOW'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'MERCHANTS' AND action = 'VIEW' AND resource_type = 'MERCHANT'
);

-- Note: MERCHANTS_VIEW_FINANCIAL has same (module_name, action, resource_type) as MERCHANTS_VIEW
-- Skip it to avoid unique constraint violation
-- INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
-- SELECT 'MERCHANTS_VIEW_FINANCIAL', 'merchants.view.financial', 'View Merchant Financial', 'MERCHANTS', 'VIEW', 'MERCHANT', 'MEDIUM'
-- WHERE NOT EXISTS (
--   SELECT 1 FROM system_permissions 
--   WHERE module_name = 'MERCHANTS' AND action = 'VIEW' AND resource_type = 'MERCHANT'
-- );

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'MERCHANTS_UPDATE', 'merchants.update', 'Update Merchant Details', 'MERCHANTS', 'UPDATE', 'MERCHANT', 'MEDIUM'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'MERCHANTS' AND action = 'UPDATE' AND resource_type = 'MERCHANT'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'MERCHANTS_APPROVE', 'merchants.approve', 'Approve Merchant', 'MERCHANTS', 'APPROVE', 'MERCHANT', 'HIGH'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'MERCHANTS' AND action = 'APPROVE' AND resource_type = 'MERCHANT'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'MERCHANTS_REJECT', 'merchants.reject', 'Reject Merchant', 'MERCHANTS', 'REJECT', 'MERCHANT', 'HIGH'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'MERCHANTS' AND action = 'REJECT' AND resource_type = 'MERCHANT'
);

-- Note: MERCHANTS_DELIST and MERCHANTS_RELIST have same (module_name, action, resource_type) as MERCHANTS_UPDATE
-- Skip them to avoid unique constraint violation
-- INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
-- SELECT 'MERCHANTS_DELIST', 'merchants.delist', 'Delist Merchant', 'MERCHANTS', 'UPDATE', 'MERCHANT', 'CRITICAL'
-- WHERE NOT EXISTS (
--   SELECT 1 FROM system_permissions 
--   WHERE module_name = 'MERCHANTS' AND action = 'UPDATE' AND resource_type = 'MERCHANT'
-- );

-- INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
-- SELECT 'MERCHANTS_RELIST', 'merchants.relist', 'Relist Merchant', 'MERCHANTS', 'UPDATE', 'MERCHANT', 'HIGH'
-- WHERE NOT EXISTS (
--   SELECT 1 FROM system_permissions 
--   WHERE module_name = 'MERCHANTS' AND action = 'UPDATE' AND resource_type = 'MERCHANT'
-- );

-- Customers - View/Manage
INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'CUSTOMERS_VIEW', 'customers.view', 'View Customers', 'CUSTOMERS', 'VIEW', 'CUSTOMER', 'LOW'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'CUSTOMERS' AND action = 'VIEW' AND resource_type = 'CUSTOMER'
);

-- Note: CUSTOMERS_VIEW_PII has same (module_name, action, resource_type) as CUSTOMERS_VIEW
-- Skip it to avoid unique constraint violation
-- INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
-- SELECT 'CUSTOMERS_VIEW_PII', 'customers.view.pii', 'View Customer PII', 'CUSTOMERS', 'VIEW', 'CUSTOMER', 'HIGH'
-- WHERE NOT EXISTS (
--   SELECT 1 FROM system_permissions 
--   WHERE module_name = 'CUSTOMERS' AND action = 'VIEW' AND resource_type = 'CUSTOMER'
-- );

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'CUSTOMERS_UPDATE', 'customers.update', 'Update Customer Details', 'CUSTOMERS', 'UPDATE', 'CUSTOMER', 'MEDIUM'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'CUSTOMERS' AND action = 'UPDATE' AND resource_type = 'CUSTOMER'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'CUSTOMERS_BLOCK', 'customers.block', 'Block Customer', 'CUSTOMERS', 'BLOCK', 'CUSTOMER', 'CRITICAL'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'CUSTOMERS' AND action = 'BLOCK' AND resource_type = 'CUSTOMER'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'CUSTOMERS_UNBLOCK', 'customers.unblock', 'Unblock Customer', 'CUSTOMERS', 'UNBLOCK', 'CUSTOMER', 'HIGH'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'CUSTOMERS' AND action = 'UNBLOCK' AND resource_type = 'CUSTOMER'
);

-- Payouts
INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'PAYOUTS_VIEW', 'payouts.view', 'View Payouts', 'PAYOUTS', 'VIEW', 'PAYOUT', 'MEDIUM'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'PAYOUTS' AND action = 'VIEW' AND resource_type = 'PAYOUT'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'PAYOUTS_APPROVE', 'payouts.approve', 'Approve Payout', 'PAYOUTS', 'APPROVE', 'PAYOUT', 'CRITICAL'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'PAYOUTS' AND action = 'APPROVE' AND resource_type = 'PAYOUT'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'PAYOUTS_REJECT', 'payouts.reject', 'Reject Payout', 'PAYOUTS', 'REJECT', 'PAYOUT', 'HIGH'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'PAYOUTS' AND action = 'REJECT' AND resource_type = 'PAYOUT'
);

-- Analytics
INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'ANALYTICS_VIEW', 'analytics.view', 'View Analytics', 'ANALYTICS', 'VIEW', 'ANALYTICS', 'LOW'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'ANALYTICS' AND action = 'VIEW' AND resource_type = 'ANALYTICS'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'ANALYTICS_EXPORT', 'analytics.export', 'Export Analytics', 'ANALYTICS', 'EXPORT', 'ANALYTICS', 'MEDIUM'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'ANALYTICS' AND action = 'EXPORT' AND resource_type = 'ANALYTICS'
);

-- Settings
INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'SETTINGS_VIEW', 'settings.view', 'View Settings', 'SETTINGS', 'VIEW', 'SETTINGS', 'LOW'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'SETTINGS' AND action = 'VIEW' AND resource_type = 'SETTINGS'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'SETTINGS_UPDATE', 'settings.update', 'Update Settings', 'SETTINGS', 'UPDATE', 'SETTINGS', 'CRITICAL'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'SETTINGS' AND action = 'UPDATE' AND resource_type = 'SETTINGS'
);

-- Users
INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'USERS_VIEW', 'users.view', 'View System Users', 'USERS', 'VIEW', 'USER', 'LOW'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'USERS' AND action = 'VIEW' AND resource_type = 'USER'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'USERS_CREATE', 'users.create', 'Create System User', 'USERS', 'CREATE', 'USER', 'CRITICAL'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'USERS' AND action = 'CREATE' AND resource_type = 'USER'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'USERS_UPDATE', 'users.update', 'Update System User', 'USERS', 'UPDATE', 'USER', 'HIGH'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'USERS' AND action = 'UPDATE' AND resource_type = 'USER'
);

INSERT INTO system_permissions (permission_id, permission_name, permission_display_name, module_name, action, resource_type, risk_level)
SELECT 'USERS_DELETE', 'users.delete', 'Delete System User', 'USERS', 'DELETE', 'USER', 'CRITICAL'
WHERE NOT EXISTS (
  SELECT 1 FROM system_permissions 
  WHERE module_name = 'USERS' AND action = 'DELETE' AND resource_type = 'USER'
);

-- Assign all permissions to SUPER_ADMIN role (idempotent)
INSERT INTO role_permissions (role_id, permission_id, service_scope, granted_by)
SELECT 
  (SELECT id FROM system_roles WHERE role_id = 'SUPER_ADMIN'),
  sp.id,
  NULL, -- ALL services
  NULL -- System default
FROM system_permissions sp
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_id = (SELECT id FROM system_roles WHERE role_id = 'SUPER_ADMIN')
    AND rp.permission_id = sp.id
    AND (rp.service_scope IS NULL)
);

-- Assign read-only permissions to READ_ONLY role (idempotent)
INSERT INTO role_permissions (role_id, permission_id, service_scope, granted_by)
SELECT 
  (SELECT id FROM system_roles WHERE role_id = 'READ_ONLY'),
  sp.id,
  NULL,
  NULL
FROM system_permissions sp
WHERE sp.action = 'VIEW'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = (SELECT id FROM system_roles WHERE role_id = 'READ_ONLY')
      AND rp.permission_id = sp.id
      AND (rp.service_scope IS NULL)
  );

-- Assign support permissions to SUPPORT_L1 (idempotent)
INSERT INTO role_permissions (role_id, permission_id, service_scope, granted_by)
SELECT 
  (SELECT id FROM system_roles WHERE role_id = 'SUPPORT_L1'),
  sp.id,
  NULL,
  NULL
FROM system_permissions sp
WHERE sp.permission_id IN ('ORDERS_VIEW', 'TICKETS_VIEW', 'TICKETS_CREATE', 'TICKETS_UPDATE', 'CUSTOMERS_VIEW')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = (SELECT id FROM system_roles WHERE role_id = 'SUPPORT_L1')
      AND rp.permission_id = sp.id
      AND (rp.service_scope IS NULL)
  );

-- ============================================================================
-- CONSTRAINTS
-- ============================================================================

-- System Users (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'system_users_email_format' AND table_name = 'system_users'
  ) THEN
    ALTER TABLE system_users
      ADD CONSTRAINT system_users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$');
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'system_users_mobile_format' AND table_name = 'system_users'
  ) THEN
    ALTER TABLE system_users
      ADD CONSTRAINT system_users_mobile_format CHECK (mobile ~ '^\+?[0-9]{10,15}$');
  END IF;
END $$;

-- Role Hierarchy (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'system_roles_level_positive' AND table_name = 'system_roles'
  ) THEN
    ALTER TABLE system_roles
      ADD CONSTRAINT system_roles_level_positive CHECK (role_level > 0);
  END IF;
END $$;

-- API Keys (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'api_keys_rate_limit_positive' AND table_name = 'system_user_api_keys'
  ) THEN
    ALTER TABLE system_user_api_keys
      ADD CONSTRAINT api_keys_rate_limit_positive CHECK (rate_limit_per_minute > 0 AND rate_limit_per_hour > 0);
  END IF;
END $$;

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE system_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_user_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_user_login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_user_ip_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_ui_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_api_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_scope_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_scope_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_access_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_access_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_management_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_management_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_management_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_access_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_access_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_access_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_management_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE advertisement_management_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_audit_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_delegation ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_emergency_mode ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Active System Users with Roles
CREATE OR REPLACE VIEW active_system_users AS
SELECT 
  su.id,
  su.system_user_id,
  su.full_name,
  su.email,
  su.primary_role,
  su.status,
  su.last_login_at,
  STRING_AGG(DISTINCT sr.role_name, ', ') AS assigned_roles,
  COUNT(DISTINCT ur.role_id) AS role_count
FROM system_users su
LEFT JOIN user_roles ur ON su.id = ur.system_user_id AND ur.is_active = TRUE
LEFT JOIN system_roles sr ON ur.role_id = sr.id
WHERE su.status = 'ACTIVE'
  AND su.deleted_at IS NULL
GROUP BY su.id, su.system_user_id, su.full_name, su.email, su.primary_role, su.status, su.last_login_at;

-- View: Permission Matrix
CREATE OR REPLACE VIEW permission_matrix AS
SELECT 
  sr.role_name,
  sp.module_name,
  sp.action,
  sp.resource_type,
  rp.service_scope,
  sp.risk_level
FROM role_permissions rp
JOIN system_roles sr ON rp.role_id = sr.id
JOIN system_permissions sp ON rp.permission_id = sp.id
WHERE rp.is_active = TRUE
  AND sr.is_active = TRUE
  AND sp.is_active = TRUE
ORDER BY sr.role_level, sp.module_name, sp.action;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE system_users IS 'Internal system users (admins, agents, managers, etc.). Controls access to platform operations.';
COMMENT ON TABLE system_roles IS 'Role definitions for RBAC. Hierarchical structure with system roles and custom roles.';
COMMENT ON TABLE system_permissions IS 'Granular permissions for all modules and actions. Used in RBAC + ABAC.';
COMMENT ON TABLE role_permissions IS 'Maps roles to permissions. Supports service-specific and geo-specific scopes.';
COMMENT ON TABLE user_roles IS 'Assigns roles to users. Supports time-based validity and multiple roles per user.';
COMMENT ON TABLE user_permission_overrides IS 'Individual permission grants/revokes. Overrides role-based permissions.';
COMMENT ON TABLE order_access_controls IS 'Fine-grained order management permissions per user.';
COMMENT ON TABLE system_audit_logs IS 'Complete audit trail for all system actions. Immutable log.';
COMMENT ON TABLE access_emergency_mode IS 'Break-glass access for emergency situations. Fully audited.';

COMMENT ON FUNCTION check_user_permission IS 'Checks if a user has a specific permission. Considers roles, overrides, and scopes.';
COMMENT ON FUNCTION get_user_permissions IS 'Returns all permissions for a user. Used by application for access control.';
