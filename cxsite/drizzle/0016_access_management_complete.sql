-- ============================================================================
-- ACCESS MANAGEMENT & GOVERNANCE SYSTEM
-- Production-Grade RBAC + ABAC for GatiMitra Platform
-- Migration: 0016_access_management_complete
-- Database: Supabase PostgreSQL
-- 
-- CONTROLS: Super Admin, Admin, Agents, Area Managers, Sales, Ads, Audit, Support
-- MANAGES: Orders, Tickets, Riders, Merchants, Customers, Payments, Offers, Ads
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'system_user_role_type') THEN
    CREATE TYPE system_user_role_type AS ENUM (
      'SUPER_ADMIN',
      'ADMIN',
      'AGENT',
      'AREA_MANAGER_MERCHANT',
      'AREA_MANAGER_RIDER',
      'SALES_TEAM',
      'ADVERTISEMENT_TEAM',
      'AUDIT_TEAM',
      'COMPLIANCE_TEAM',
      'SUPPORT_L1',
      'SUPPORT_L2',
      'SUPPORT_L3',
      'FINANCE_TEAM',
      'OPERATIONS_TEAM',
      'DEVELOPER',
      'READ_ONLY'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'system_user_status') THEN
    CREATE TYPE system_user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED', 'PENDING_ACTIVATION', 'LOCKED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'permission_action') THEN
    CREATE TYPE permission_action AS ENUM ('VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'ASSIGN', 'CANCEL', 'REFUND', 'BLOCK', 'UNBLOCK', 'EXPORT', 'IMPORT');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_module') THEN
    CREATE TYPE access_module AS ENUM ('ORDERS', 'TICKETS', 'RIDERS', 'MERCHANTS', 'CUSTOMERS', 'PAYMENTS', 'REFUNDS', 'PAYOUTS', 'OFFERS', 'ADVERTISEMENTS', 'ANALYTICS', 'AUDIT', 'SETTINGS', 'USERS');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'area_type') THEN
    CREATE TYPE area_type AS ENUM ('CITY', 'ZONE', 'REGION', 'STATE', 'COUNTRY');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_level') THEN
    CREATE TYPE access_level AS ENUM ('NONE', 'READ', 'READ_WRITE', 'FULL', 'ADMIN');
  END IF;
END $$;

-- ============================================================================
-- PHASE 1: CORE ACCESS STRUCTURE
-- ============================================================================

-- System Users (Internal Users)
CREATE TABLE IF NOT EXISTS system_users (
  id BIGSERIAL PRIMARY KEY,
  system_user_id TEXT NOT NULL UNIQUE,
  
  -- Personal Details
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT NOT NULL UNIQUE,
  mobile TEXT NOT NULL,
  alternate_mobile TEXT,
  
  -- Role (Primary Role)
  primary_role system_user_role_type NOT NULL,
  role_display_name TEXT,
  
  -- Department
  department TEXT,
  team TEXT,
  
  -- Reporting
  reports_to_id BIGINT REFERENCES system_users(id),
  manager_name TEXT,
  
  -- Status
  status system_user_status NOT NULL DEFAULT 'PENDING_ACTIVATION',
  status_reason TEXT,
  
  -- Account Security
  is_email_verified BOOLEAN DEFAULT FALSE,
  is_mobile_verified BOOLEAN DEFAULT FALSE,
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  
  -- Activity
  last_login_at TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE,
  login_count INTEGER DEFAULT 0,
  failed_login_attempts INTEGER DEFAULT 0,
  account_locked_until TIMESTAMP WITH TIME ZONE,
  
  -- Audit
  created_by BIGINT REFERENCES system_users(id),
  created_by_name TEXT,
  approved_by BIGINT REFERENCES system_users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  
  -- Soft Delete
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by BIGINT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS system_users_system_user_id_idx ON system_users(system_user_id);
CREATE INDEX IF NOT EXISTS system_users_email_idx ON system_users(email);
CREATE INDEX IF NOT EXISTS system_users_mobile_idx ON system_users(mobile);
CREATE INDEX IF NOT EXISTS system_users_primary_role_idx ON system_users(primary_role);
CREATE INDEX IF NOT EXISTS system_users_status_idx ON system_users(status);
CREATE INDEX IF NOT EXISTS system_users_reports_to_idx ON system_users(reports_to_id);

-- System User Auth
CREATE TABLE IF NOT EXISTS system_user_auth (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Password
  password_hash TEXT NOT NULL,
  password_salt TEXT,
  password_last_changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  password_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- 2FA
  two_factor_secret TEXT,
  two_factor_backup_codes TEXT[],
  
  -- OTP
  last_otp TEXT,
  last_otp_sent_at TIMESTAMP WITH TIME ZONE,
  otp_attempts INTEGER DEFAULT 0,
  
  -- Security
  security_questions JSONB DEFAULT '[]',
  
  -- Recovery
  recovery_email TEXT,
  recovery_mobile TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(system_user_id)
);

CREATE INDEX IF NOT EXISTS system_user_auth_system_user_id_idx ON system_user_auth(system_user_id);

-- System User Sessions
CREATE TABLE IF NOT EXISTS system_user_sessions (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Session Details
  session_token TEXT NOT NULL UNIQUE,
  refresh_token TEXT,
  
  -- Device & Network
  device_id TEXT,
  device_type TEXT,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  
  -- Location
  location_city TEXT,
  location_country TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  logged_out_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS system_user_sessions_system_user_id_idx ON system_user_sessions(system_user_id);
CREATE INDEX IF NOT EXISTS system_user_sessions_session_token_idx ON system_user_sessions(session_token);
CREATE INDEX IF NOT EXISTS system_user_sessions_is_active_idx ON system_user_sessions(is_active) WHERE is_active = TRUE;

-- System User Login History
CREATE TABLE IF NOT EXISTS system_user_login_history (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Login Details
  login_method TEXT NOT NULL, -- 'PASSWORD', 'OTP', 'SSO', '2FA'
  login_success BOOLEAN NOT NULL,
  
  -- Device & Network
  device_id TEXT,
  device_type TEXT,
  ip_address TEXT,
  user_agent TEXT,
  
  -- Location
  location_city TEXT,
  location_country TEXT,
  
  -- Failure Details
  failure_reason TEXT,
  failure_code TEXT,
  
  -- Session
  session_id BIGINT REFERENCES system_user_sessions(id) ON DELETE SET NULL,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS system_user_login_history_user_id_idx ON system_user_login_history(system_user_id);
CREATE INDEX IF NOT EXISTS system_user_login_history_login_success_idx ON system_user_login_history(login_success);
CREATE INDEX IF NOT EXISTS system_user_login_history_created_at_idx ON system_user_login_history(created_at);

-- System User API Keys
CREATE TABLE IF NOT EXISTS system_user_api_keys (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- API Key Details
  api_key TEXT NOT NULL UNIQUE,
  api_key_hash TEXT NOT NULL,
  api_key_name TEXT NOT NULL,
  api_key_description TEXT,
  
  -- Permissions
  allowed_modules access_module[],
  allowed_actions permission_action[],
  
  -- Rate Limiting
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_hour INTEGER DEFAULT 1000,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Expiry
  expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Usage
  last_used_at TIMESTAMP WITH TIME ZONE,
  usage_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES system_users(id)
);

CREATE INDEX IF NOT EXISTS system_user_api_keys_user_id_idx ON system_user_api_keys(system_user_id);
CREATE INDEX IF NOT EXISTS system_user_api_keys_api_key_hash_idx ON system_user_api_keys(api_key_hash);
CREATE INDEX IF NOT EXISTS system_user_api_keys_is_active_idx ON system_user_api_keys(is_active) WHERE is_active = TRUE;

-- System User IP Whitelist
CREATE TABLE IF NOT EXISTS system_user_ip_whitelist (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- IP Details
  ip_address TEXT NOT NULL,
  ip_range TEXT, -- CIDR notation
  
  -- Description
  ip_label TEXT,
  ip_description TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  added_by BIGINT REFERENCES system_users(id),
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS system_user_ip_whitelist_user_id_idx ON system_user_ip_whitelist(system_user_id);
CREATE INDEX IF NOT EXISTS system_user_ip_whitelist_ip_address_idx ON system_user_ip_whitelist(ip_address);

-- ============================================================================
-- PHASE 2: RBAC (ROLE-BASED ACCESS CONTROL)
-- ============================================================================

-- System Roles
CREATE TABLE IF NOT EXISTS system_roles (
  id BIGSERIAL PRIMARY KEY,
  role_id TEXT NOT NULL UNIQUE,
  
  -- Role Details
  role_name TEXT NOT NULL UNIQUE,
  role_display_name TEXT NOT NULL,
  role_description TEXT,
  
  -- Role Type
  role_type system_user_role_type NOT NULL,
  
  -- Hierarchy
  role_level INTEGER NOT NULL, -- 1 = SUPER_ADMIN, 2 = ADMIN, 3+ = others
  parent_role_id BIGINT REFERENCES system_roles(id),
  
  -- System Role
  is_system_role BOOLEAN DEFAULT FALSE, -- Cannot be deleted
  is_custom_role BOOLEAN DEFAULT FALSE,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  created_by BIGINT REFERENCES system_users(id),
  updated_by BIGINT REFERENCES system_users(id),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS system_roles_role_id_idx ON system_roles(role_id);
CREATE INDEX IF NOT EXISTS system_roles_role_type_idx ON system_roles(role_type);
CREATE INDEX IF NOT EXISTS system_roles_is_active_idx ON system_roles(is_active) WHERE is_active = TRUE;

-- System Permissions
CREATE TABLE IF NOT EXISTS system_permissions (
  id BIGSERIAL PRIMARY KEY,
  permission_id TEXT NOT NULL UNIQUE,
  
  -- Permission Details
  permission_name TEXT NOT NULL UNIQUE,
  permission_display_name TEXT NOT NULL,
  permission_description TEXT,
  
  -- Module & Action
  module_name access_module NOT NULL,
  action permission_action NOT NULL,
  
  -- Granularity
  resource_type TEXT, -- 'ORDER', 'TICKET', 'RIDER', 'MERCHANT', 'CUSTOMER', 'PAYOUT'
  
  -- Risk Level
  risk_level TEXT DEFAULT 'LOW', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  requires_approval BOOLEAN DEFAULT FALSE,
  requires_mfa BOOLEAN DEFAULT FALSE,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(module_name, action, resource_type)
);

CREATE INDEX IF NOT EXISTS system_permissions_permission_id_idx ON system_permissions(permission_id);
CREATE INDEX IF NOT EXISTS system_permissions_module_idx ON system_permissions(module_name);
CREATE INDEX IF NOT EXISTS system_permissions_action_idx ON system_permissions(action);
CREATE INDEX IF NOT EXISTS system_permissions_risk_level_idx ON system_permissions(risk_level);

-- Role Permissions (Mapping)
CREATE TABLE IF NOT EXISTS role_permissions (
  id BIGSERIAL PRIMARY KEY,
  role_id BIGINT NOT NULL REFERENCES system_roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES system_permissions(id) ON DELETE CASCADE,
  
  -- Scope
  service_scope service_type[], -- NULL = ALL services
  geo_scope TEXT[], -- Cities/regions
  
  -- Conditions
  conditions JSONB DEFAULT '{}', -- Additional conditions
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  granted_by BIGINT REFERENCES system_users(id),
  granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(role_id, permission_id, service_scope)
);

CREATE INDEX IF NOT EXISTS role_permissions_role_id_idx ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS role_permissions_permission_id_idx ON role_permissions(permission_id);

-- User Roles (User-Role Assignment)
CREATE TABLE IF NOT EXISTS user_roles (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES system_roles(id) ON DELETE CASCADE,
  
  -- Assignment Details
  is_primary BOOLEAN DEFAULT FALSE,
  
  -- Validity
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  valid_until TIMESTAMP WITH TIME ZONE, -- NULL = permanent
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  assigned_by BIGINT NOT NULL REFERENCES system_users(id),
  assigned_by_name TEXT,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP WITH TIME ZONE,
  revoked_by BIGINT REFERENCES system_users(id),
  revoke_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(system_user_id, role_id)
);

CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON user_roles(system_user_id);
CREATE INDEX IF NOT EXISTS user_roles_role_id_idx ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS user_roles_is_active_idx ON user_roles(is_active) WHERE is_active = TRUE;

-- User Permission Overrides (Grant/Revoke Specific Permissions)
CREATE TABLE IF NOT EXISTS user_permission_overrides (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES system_permissions(id) ON DELETE CASCADE,
  
  -- Override Type
  override_type TEXT NOT NULL, -- 'GRANT', 'REVOKE'
  is_allowed BOOLEAN NOT NULL,
  
  -- Reason
  override_reason TEXT NOT NULL,
  
  -- Scope
  service_scope service_type[],
  geo_scope TEXT[],
  
  -- Validity
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  valid_until TIMESTAMP WITH TIME ZONE,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  granted_by BIGINT NOT NULL REFERENCES system_users(id),
  granted_by_name TEXT,
  granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP WITH TIME ZONE,
  revoked_by BIGINT REFERENCES system_users(id),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_permission_overrides_user_id_idx ON user_permission_overrides(system_user_id);
CREATE INDEX IF NOT EXISTS user_permission_overrides_permission_id_idx ON user_permission_overrides(permission_id);
CREATE INDEX IF NOT EXISTS user_permission_overrides_is_active_idx ON user_permission_overrides(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- PHASE 3: MODULE & PAGE ACCESS
-- ============================================================================

-- Access Modules
CREATE TABLE IF NOT EXISTS access_modules (
  id BIGSERIAL PRIMARY KEY,
  module_id TEXT NOT NULL UNIQUE,
  
  -- Module Details
  module_name TEXT NOT NULL UNIQUE,
  module_display_name TEXT NOT NULL,
  module_description TEXT,
  module_type access_module NOT NULL,
  
  -- Parent Module (for sub-modules)
  parent_module_id BIGINT REFERENCES access_modules(id),
  
  -- Ordering
  display_order INTEGER DEFAULT 0,
  
  -- Icon
  module_icon TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS access_modules_module_id_idx ON access_modules(module_id);
CREATE INDEX IF NOT EXISTS access_modules_module_type_idx ON access_modules(module_type);

-- Access Pages
CREATE TABLE IF NOT EXISTS access_pages (
  id BIGSERIAL PRIMARY KEY,
  page_id TEXT NOT NULL UNIQUE,
  module_id BIGINT NOT NULL REFERENCES access_modules(id) ON DELETE CASCADE,
  
  -- Page Details
  page_name TEXT NOT NULL,
  page_display_name TEXT NOT NULL,
  page_description TEXT,
  route_path TEXT NOT NULL UNIQUE,
  
  -- Permissions Required
  required_permissions BIGINT[], -- Array of permission IDs
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS access_pages_page_id_idx ON access_pages(page_id);
CREATE INDEX IF NOT EXISTS access_pages_module_id_idx ON access_pages(module_id);
CREATE INDEX IF NOT EXISTS access_pages_route_path_idx ON access_pages(route_path);

-- Access UI Components (Button-level permissions)
CREATE TABLE IF NOT EXISTS access_ui_components (
  id BIGSERIAL PRIMARY KEY,
  component_id TEXT NOT NULL UNIQUE,
  page_id BIGINT REFERENCES access_pages(id) ON DELETE CASCADE,
  
  -- Component Details
  component_name TEXT NOT NULL,
  component_type TEXT, -- 'BUTTON', 'LINK', 'FORM', 'TABLE', 'SECTION'
  
  -- Permissions Required
  required_permission_id BIGINT REFERENCES system_permissions(id) ON DELETE SET NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS access_ui_components_component_id_idx ON access_ui_components(component_id);
CREATE INDEX IF NOT EXISTS access_ui_components_page_id_idx ON access_ui_components(page_id);

-- Access API Endpoints
CREATE TABLE IF NOT EXISTS access_api_endpoints (
  id BIGSERIAL PRIMARY KEY,
  endpoint_id TEXT NOT NULL UNIQUE,
  
  -- Endpoint Details
  endpoint_path TEXT NOT NULL,
  http_method TEXT NOT NULL, -- 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'
  endpoint_description TEXT,
  
  -- Module
  module_name access_module NOT NULL,
  
  -- Permissions Required
  required_permissions BIGINT[],
  
  -- Rate Limiting
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_hour INTEGER DEFAULT 1000,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_public BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS access_api_endpoints_endpoint_id_idx ON access_api_endpoints(endpoint_id);
CREATE INDEX IF NOT EXISTS access_api_endpoints_module_idx ON access_api_endpoints(module_name);
CREATE INDEX IF NOT EXISTS access_api_endpoints_endpoint_path_idx ON access_api_endpoints(endpoint_path, http_method);

-- Access Feature Flags
CREATE TABLE IF NOT EXISTS access_feature_flags (
  id BIGSERIAL PRIMARY KEY,
  feature_id TEXT NOT NULL UNIQUE,
  
  -- Feature Details
  feature_name TEXT NOT NULL UNIQUE,
  feature_description TEXT,
  
  -- Status
  is_enabled BOOLEAN DEFAULT FALSE,
  
  -- Rollout
  rollout_percentage INTEGER DEFAULT 0, -- 0-100
  enabled_for_roles system_user_role_type[],
  enabled_for_users BIGINT[],
  
  -- Environment
  environment TEXT DEFAULT 'production', -- 'development', 'staging', 'production'
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS access_feature_flags_feature_id_idx ON access_feature_flags(feature_id);
CREATE INDEX IF NOT EXISTS access_feature_flags_is_enabled_idx ON access_feature_flags(is_enabled);

-- Continue in Part 2...
