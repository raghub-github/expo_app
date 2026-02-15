-- ============================================================================
-- CRITICAL INDEXES - PART 5: Wallet, Financial & Access Management
-- Migration: 0026_critical_indexes_part5
-- Database: Supabase PostgreSQL
-- 
-- This file adds indexes for wallet, financial, and access management tables
-- ============================================================================

-- ============================================================================
-- WALLET LEDGER INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS wallet_ledger_rider_id_idx ON wallet_ledger(rider_id);
CREATE INDEX IF NOT EXISTS wallet_ledger_entry_type_idx ON wallet_ledger(entry_type);
CREATE INDEX IF NOT EXISTS wallet_ledger_ref_type_idx ON wallet_ledger(ref_type) WHERE ref_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS wallet_ledger_created_at_idx ON wallet_ledger(created_at);
CREATE INDEX IF NOT EXISTS wallet_ledger_rider_created_desc_idx ON wallet_ledger(rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_ledger_rider_type_created_idx ON wallet_ledger(rider_id, entry_type, created_at DESC);

-- ============================================================================
-- WITHDRAWAL REQUESTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS withdrawal_requests_rider_id_idx ON withdrawal_requests(rider_id);
CREATE INDEX IF NOT EXISTS withdrawal_requests_status_idx ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS withdrawal_requests_settlement_batch_id_idx ON withdrawal_requests(settlement_batch_id) WHERE settlement_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS withdrawal_requests_created_at_idx ON withdrawal_requests(created_at);
CREATE INDEX IF NOT EXISTS withdrawal_requests_pending_idx ON withdrawal_requests(rider_id, created_at DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS withdrawal_requests_rider_status_idx ON withdrawal_requests(rider_id, status, created_at DESC);

-- ============================================================================
-- SETTLEMENT BATCHES INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS settlement_batches_batch_number_idx ON settlement_batches(batch_number);
CREATE INDEX IF NOT EXISTS settlement_batches_status_idx ON settlement_batches(status);
CREATE INDEX IF NOT EXISTS settlement_batches_date_range_idx ON settlement_batches(date_range_start, date_range_end);
CREATE INDEX IF NOT EXISTS settlement_batches_pending_idx ON settlement_batches(status, created_at) 
  WHERE status = 'pending';

-- ============================================================================
-- COD COLLECTIONS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS cod_collections_order_id_idx ON cod_collections(order_id);
CREATE INDEX IF NOT EXISTS cod_collections_collected_by_idx ON cod_collections(collected_by);
CREATE INDEX IF NOT EXISTS cod_collections_collected_at_idx ON cod_collections(collected_at);
CREATE INDEX IF NOT EXISTS cod_collections_deposited_to_bank_idx ON cod_collections(deposited_to_bank) WHERE deposited_to_bank = FALSE;
CREATE INDEX IF NOT EXISTS cod_collections_rider_collected_idx ON cod_collections(collected_by, collected_at DESC);

-- ============================================================================
-- COMMISSION HISTORY INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS commission_history_order_type_idx ON commission_history(order_type);
CREATE INDEX IF NOT EXISTS commission_history_city_idx ON commission_history(city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_history_effective_from_idx ON commission_history(effective_from);
CREATE INDEX IF NOT EXISTS commission_history_effective_to_idx ON commission_history(effective_to) WHERE effective_to IS NOT NULL;

-- ============================================================================
-- SYSTEM USERS INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS system_users_system_user_id_idx ON system_users(system_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS system_users_email_idx ON system_users(email);
CREATE INDEX IF NOT EXISTS system_users_mobile_idx ON system_users(mobile);
CREATE INDEX IF NOT EXISTS system_users_primary_role_idx ON system_users(primary_role);
CREATE INDEX IF NOT EXISTS system_users_status_idx ON system_users(status);
CREATE INDEX IF NOT EXISTS system_users_department_idx ON system_users(department) WHERE department IS NOT NULL;
CREATE INDEX IF NOT EXISTS system_users_reports_to_id_idx ON system_users(reports_to_id) WHERE reports_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS system_users_active_idx ON system_users(status, created_at) WHERE status = 'ACTIVE';

-- ============================================================================
-- SYSTEM USER SESSIONS INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS system_user_sessions_session_token_idx ON system_user_sessions(session_token);
CREATE INDEX IF NOT EXISTS system_user_sessions_system_user_id_idx ON system_user_sessions(system_user_id);
CREATE INDEX IF NOT EXISTS system_user_sessions_is_active_idx ON system_user_sessions(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS system_user_sessions_expires_at_idx ON system_user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS system_user_sessions_ip_address_idx ON system_user_sessions(ip_address);

-- ============================================================================
-- SYSTEM USER LOGIN HISTORY INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS system_user_login_history_system_user_id_idx ON system_user_login_history(system_user_id);
CREATE INDEX IF NOT EXISTS system_user_login_history_login_success_idx ON system_user_login_history(login_success);
CREATE INDEX IF NOT EXISTS system_user_login_history_login_method_idx ON system_user_login_history(login_method);
CREATE INDEX IF NOT EXISTS system_user_login_history_created_at_idx ON system_user_login_history(created_at);
CREATE INDEX IF NOT EXISTS system_user_login_history_user_created_idx ON system_user_login_history(system_user_id, created_at DESC);

-- ============================================================================
-- SYSTEM ROLES INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS system_roles_role_id_idx ON system_roles(role_id);
CREATE UNIQUE INDEX IF NOT EXISTS system_roles_role_name_idx ON system_roles(role_name);
CREATE INDEX IF NOT EXISTS system_roles_role_type_idx ON system_roles(role_type);
CREATE INDEX IF NOT EXISTS system_roles_is_active_idx ON system_roles(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS system_roles_parent_role_id_idx ON system_roles(parent_role_id) WHERE parent_role_id IS NOT NULL;

-- ============================================================================
-- SYSTEM PERMISSIONS INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS system_permissions_permission_id_idx ON system_permissions(permission_id);
CREATE UNIQUE INDEX IF NOT EXISTS system_permissions_permission_name_idx ON system_permissions(permission_name);
CREATE INDEX IF NOT EXISTS system_permissions_module_name_idx ON system_permissions(module_name);
CREATE INDEX IF NOT EXISTS system_permissions_action_idx ON system_permissions(action);
CREATE INDEX IF NOT EXISTS system_permissions_is_active_idx ON system_permissions(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- USER ROLES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS user_roles_system_user_id_idx ON user_roles(system_user_id);
CREATE INDEX IF NOT EXISTS user_roles_role_id_idx ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS user_roles_is_active_idx ON user_roles(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS user_roles_is_primary_idx ON user_roles(is_primary) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS user_roles_user_active_idx ON user_roles(system_user_id, is_active) WHERE is_active = TRUE;

-- ============================================================================
-- ROLE PERMISSIONS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS role_permissions_role_id_idx ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS role_permissions_permission_id_idx ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS role_permissions_is_active_idx ON role_permissions(is_active) WHERE is_active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_role_permission_idx ON role_permissions(role_id, permission_id) WHERE is_active = TRUE;

-- ============================================================================
-- USER PERMISSION OVERRIDES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS user_permission_overrides_system_user_id_idx ON user_permission_overrides(system_user_id);
CREATE INDEX IF NOT EXISTS user_permission_overrides_permission_id_idx ON user_permission_overrides(permission_id);
CREATE INDEX IF NOT EXISTS user_permission_overrides_is_active_idx ON user_permission_overrides(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS user_permission_overrides_override_type_idx ON user_permission_overrides(override_type);

-- ============================================================================
-- PERMISSION CHANGE LOGS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS permission_change_logs_target_user_id_idx ON permission_change_logs(target_user_id);
CREATE INDEX IF NOT EXISTS permission_change_logs_changed_by_idx ON permission_change_logs(changed_by);
CREATE INDEX IF NOT EXISTS permission_change_logs_change_type_idx ON permission_change_logs(change_type);
CREATE INDEX IF NOT EXISTS permission_change_logs_created_at_idx ON permission_change_logs(created_at);

-- ============================================================================
-- SYSTEM AUDIT LOGS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS system_audit_logs_system_user_id_idx ON system_audit_logs(system_user_id) WHERE system_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS system_audit_logs_module_name_idx ON system_audit_logs(module_name);
CREATE INDEX IF NOT EXISTS system_audit_logs_action_type_idx ON system_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS system_audit_logs_entity_type_idx ON system_audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS system_audit_logs_created_at_idx ON system_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS system_audit_logs_user_module_created_idx ON system_audit_logs(system_user_id, module_name, created_at DESC) WHERE system_user_id IS NOT NULL;

-- ============================================================================
-- ACCESS ACTIVITY LOGS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS access_activity_logs_system_user_id_idx ON access_activity_logs(system_user_id);
CREATE INDEX IF NOT EXISTS access_activity_logs_access_type_idx ON access_activity_logs(access_type);
CREATE INDEX IF NOT EXISTS access_activity_logs_api_endpoint_idx ON access_activity_logs(api_endpoint) WHERE api_endpoint IS NOT NULL;
CREATE INDEX IF NOT EXISTS access_activity_logs_created_at_idx ON access_activity_logs(created_at);
CREATE INDEX IF NOT EXISTS access_activity_logs_user_created_idx ON access_activity_logs(system_user_id, created_at DESC);

-- ============================================================================
-- ACCESS API ENDPOINTS INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS access_api_endpoints_endpoint_id_idx ON access_api_endpoints(endpoint_id);
CREATE INDEX IF NOT EXISTS access_api_endpoints_endpoint_path_idx ON access_api_endpoints(endpoint_path);
CREATE INDEX IF NOT EXISTS access_api_endpoints_module_name_idx ON access_api_endpoints(module_name);
CREATE INDEX IF NOT EXISTS access_api_endpoints_is_active_idx ON access_api_endpoints(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- AREA ASSIGNMENTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS area_assignments_system_user_id_idx ON area_assignments(system_user_id);
CREATE INDEX IF NOT EXISTS area_assignments_area_type_idx ON area_assignments(area_type);
CREATE INDEX IF NOT EXISTS area_assignments_area_code_idx ON area_assignments(area_code);
CREATE INDEX IF NOT EXISTS area_assignments_is_active_idx ON area_assignments(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- SERVICE SCOPE ASSIGNMENTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS service_scope_assignments_system_user_id_idx ON service_scope_assignments(system_user_id);
CREATE INDEX IF NOT EXISTS service_scope_assignments_service_type_idx ON service_scope_assignments(service_type);
CREATE INDEX IF NOT EXISTS service_scope_assignments_access_level_idx ON service_scope_assignments(access_level);
CREATE INDEX IF NOT EXISTS service_scope_assignments_is_active_idx ON service_scope_assignments(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- ENTITY SCOPE ASSIGNMENTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS entity_scope_assignments_system_user_id_idx ON entity_scope_assignments(system_user_id);
CREATE INDEX IF NOT EXISTS entity_scope_assignments_entity_type_idx ON entity_scope_assignments(entity_type);
CREATE INDEX IF NOT EXISTS entity_scope_assignments_entity_id_idx ON entity_scope_assignments(entity_id);
CREATE INDEX IF NOT EXISTS entity_scope_assignments_is_active_idx ON entity_scope_assignments(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX wallet_ledger_rider_created_desc_idx IS 'Optimizes queries for rider wallet transaction history';
COMMENT ON INDEX withdrawal_requests_pending_idx IS 'Optimizes queries for pending withdrawal requests';
COMMENT ON INDEX system_audit_logs_user_module_created_idx IS 'Optimizes queries for user activity by module';
