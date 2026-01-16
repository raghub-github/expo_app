-- Dashboard Access Control System Migration
-- Creates tables for dashboard-level access control and action audit logging

-- ============================================================================
-- 1. DASHBOARD_ACCESS TABLE
-- ============================================================================
-- Stores which dashboards a user can access

CREATE TABLE IF NOT EXISTS dashboard_access (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Dashboard Type
  dashboard_type TEXT NOT NULL, -- 'RIDER', 'MERCHANT', 'CUSTOMER', 'ORDER', 'TICKET', 'OFFER', 'AREA_MANAGER', 'PAYMENT', 'SYSTEM', 'ANALYTICS'
  
  -- Access Level
  access_level TEXT NOT NULL DEFAULT 'VIEW_ONLY', -- 'VIEW_ONLY', 'FULL_ACCESS', 'RESTRICTED'
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  granted_by BIGINT NOT NULL REFERENCES system_users(id),
  granted_by_name TEXT,
  granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP WITH TIME ZONE,
  revoked_by BIGINT REFERENCES system_users(id),
  revoke_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(system_user_id, dashboard_type)
);

CREATE INDEX IF NOT EXISTS dashboard_access_user_id_idx ON dashboard_access(system_user_id);
CREATE INDEX IF NOT EXISTS dashboard_access_dashboard_type_idx ON dashboard_access(dashboard_type);
CREATE INDEX IF NOT EXISTS dashboard_access_is_active_idx ON dashboard_access(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- 2. DASHBOARD_ACCESS_POINTS TABLE
-- ============================================================================
-- Stores grouped access points (actions) within each dashboard

CREATE TABLE IF NOT EXISTS dashboard_access_points (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  dashboard_type TEXT NOT NULL, -- References dashboard_access.dashboard_type
  
  -- Access Point Group
  access_point_group TEXT NOT NULL, -- e.g., 'RIDER_ACTIONS', 'MERCHANT_ONBOARDING', 'ORDER_ACTIONS', 'TICKET_CATEGORY_MERCHANT'
  
  -- Access Point Details
  access_point_name TEXT NOT NULL, -- Display name
  access_point_description TEXT,
  
  -- Allowed Actions (JSONB array of actions)
  allowed_actions JSONB NOT NULL DEFAULT '[]', -- ['view', 'update', 'cancel', 'refund', etc.]
  
  -- Additional Context (for ticket categories, etc.)
  context JSONB DEFAULT '{}', -- e.g., {"ticket_category": "MERCHANT", "ticket_type": "ORDER_RELATED"}
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  granted_by BIGINT NOT NULL REFERENCES system_users(id),
  granted_by_name TEXT,
  granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP WITH TIME ZONE,
  revoked_by BIGINT REFERENCES system_users(id),
  revoke_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(system_user_id, dashboard_type, access_point_group)
);

CREATE INDEX IF NOT EXISTS dashboard_access_points_user_id_idx ON dashboard_access_points(system_user_id);
CREATE INDEX IF NOT EXISTS dashboard_access_points_dashboard_type_idx ON dashboard_access_points(dashboard_type);
CREATE INDEX IF NOT EXISTS dashboard_access_points_group_idx ON dashboard_access_points(access_point_group);
CREATE INDEX IF NOT EXISTS dashboard_access_points_is_active_idx ON dashboard_access_points(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- 3. ACTION_AUDIT_LOG TABLE
-- ============================================================================
-- Tracks all actions performed by agents

CREATE TABLE IF NOT EXISTS action_audit_log (
  id BIGSERIAL PRIMARY KEY,
  
  -- Agent Information
  agent_id BIGINT NOT NULL REFERENCES system_users(id),
  agent_email TEXT NOT NULL,
  agent_name TEXT,
  agent_role TEXT,
  
  -- Action Details
  dashboard_type TEXT NOT NULL,
  action_type TEXT NOT NULL, -- 'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'CANCEL', 'REFUND', etc.
  resource_type TEXT, -- 'RIDER', 'ORDER', 'TICKET', 'MERCHANT', etc.
  resource_id TEXT, -- ID of the resource being acted upon
  
  -- Action Context
  action_details JSONB DEFAULT '{}', -- Full details of what was changed
  previous_values JSONB, -- Previous state (for updates)
  new_values JSONB, -- New state (for updates)
  
  -- Request Context
  ip_address TEXT,
  user_agent TEXT,
  request_path TEXT,
  request_method TEXT,
  
  -- Status
  action_status TEXT DEFAULT 'SUCCESS', -- 'SUCCESS', 'FAILED', 'PENDING'
  error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS action_audit_log_agent_id_idx ON action_audit_log(agent_id);
CREATE INDEX IF NOT EXISTS action_audit_log_dashboard_type_idx ON action_audit_log(dashboard_type);
CREATE INDEX IF NOT EXISTS action_audit_log_resource_type_idx ON action_audit_log(resource_type);
CREATE INDEX IF NOT EXISTS action_audit_log_created_at_idx ON action_audit_log(created_at);
CREATE INDEX IF NOT EXISTS action_audit_log_action_type_idx ON action_audit_log(action_type);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE dashboard_access IS 'Stores which dashboards each system user can access';
COMMENT ON TABLE dashboard_access_points IS 'Stores grouped access points (actions) within each dashboard for each user';
COMMENT ON TABLE action_audit_log IS 'Tracks all actions performed by agents for audit and compliance purposes';
