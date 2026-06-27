-- ============================================================================
-- ACCESS CONTROLS & AUDIT SYSTEM
-- Migration: 0017_access_controls_and_audit
-- Database: Supabase PostgreSQL
-- ============================================================================

-- ============================================================================
-- PHASE 4: AREA & SCOPE ASSIGNMENTS
-- ============================================================================

-- Area Assignments (Geographic Access)
CREATE TABLE IF NOT EXISTS area_assignments (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Area Details
  area_type area_type NOT NULL,
  area_code TEXT NOT NULL,
  area_name TEXT NOT NULL,
  
  -- Service Type
  service_type service_type, -- NULL = ALL services
  
  -- Coverage
  cities TEXT[],
  postal_codes TEXT[],
  geo_boundary JSONB, -- GeoJSON polygon
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Validity
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  valid_until TIMESTAMP WITH TIME ZONE,
  
  -- Audit
  assigned_by BIGINT REFERENCES system_users(id),
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS area_assignments_user_id_idx ON area_assignments(system_user_id);
CREATE INDEX IF NOT EXISTS area_assignments_area_type_idx ON area_assignments(area_type);
CREATE INDEX IF NOT EXISTS area_assignments_service_type_idx ON area_assignments(service_type);
CREATE INDEX IF NOT EXISTS area_assignments_is_active_idx ON area_assignments(is_active) WHERE is_active = TRUE;

-- Service Scope Assignments
CREATE TABLE IF NOT EXISTS service_scope_assignments (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Service
  service_type service_type NOT NULL,
  
  -- Access Level
  access_level access_level NOT NULL DEFAULT 'READ',
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  assigned_by BIGINT REFERENCES system_users(id),
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(system_user_id, service_type)
);

CREATE INDEX IF NOT EXISTS service_scope_assignments_user_id_idx ON service_scope_assignments(system_user_id);
CREATE INDEX IF NOT EXISTS service_scope_assignments_service_type_idx ON service_scope_assignments(service_type);

-- Entity Scope Assignments (Specific Entity Access)
CREATE TABLE IF NOT EXISTS entity_scope_assignments (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Entity
  entity_type TEXT NOT NULL, -- 'MERCHANT', 'RIDER', 'CUSTOMER', 'ORDER'
  entity_id BIGINT NOT NULL,
  
  -- Access Level
  access_level access_level NOT NULL DEFAULT 'READ',
  
  -- Reason
  assignment_reason TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Validity
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  valid_until TIMESTAMP WITH TIME ZONE,
  
  -- Audit
  assigned_by BIGINT REFERENCES system_users(id),
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS entity_scope_assignments_user_id_idx ON entity_scope_assignments(system_user_id);
CREATE INDEX IF NOT EXISTS entity_scope_assignments_entity_idx ON entity_scope_assignments(entity_type, entity_id);

-- ============================================================================
-- PHASE 5: DOMAIN-SPECIFIC ACCESS CONTROLS
-- ============================================================================

-- Order Access Controls
CREATE TABLE IF NOT EXISTS order_access_controls (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- View Access
  can_view_all_orders BOOLEAN DEFAULT FALSE,
  can_view_assigned_orders BOOLEAN DEFAULT TRUE,
  can_view_order_financial BOOLEAN DEFAULT FALSE,
  can_view_customer_details BOOLEAN DEFAULT FALSE,
  can_view_merchant_details BOOLEAN DEFAULT FALSE,
  can_view_rider_details BOOLEAN DEFAULT FALSE,
  
  -- Action Access
  can_create_order BOOLEAN DEFAULT FALSE,
  can_update_order BOOLEAN DEFAULT FALSE,
  can_cancel_order BOOLEAN DEFAULT FALSE,
  can_assign_rider BOOLEAN DEFAULT FALSE,
  can_reassign_rider BOOLEAN DEFAULT FALSE,
  can_override_status BOOLEAN DEFAULT FALSE,
  can_add_remark BOOLEAN DEFAULT FALSE,
  
  -- Financial Access
  can_process_refund BOOLEAN DEFAULT FALSE,
  can_approve_refund BOOLEAN DEFAULT FALSE,
  can_adjust_fare BOOLEAN DEFAULT FALSE,
  
  -- Approval Limits
  refund_approval_limit NUMERIC(12, 2) DEFAULT 0,
  fare_adjustment_limit NUMERIC(10, 2) DEFAULT 0,
  
  -- Service Scope
  food_access BOOLEAN DEFAULT TRUE,
  parcel_access BOOLEAN DEFAULT TRUE,
  ride_access BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(system_user_id)
);

CREATE INDEX IF NOT EXISTS order_access_controls_user_id_idx ON order_access_controls(system_user_id);

-- Ticket Access Controls
CREATE TABLE IF NOT EXISTS ticket_access_controls (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Ticket Type Access
  customer_ticket_access BOOLEAN DEFAULT TRUE,
  rider_ticket_access BOOLEAN DEFAULT FALSE,
  merchant_ticket_access BOOLEAN DEFAULT FALSE,
  
  -- Action Access
  can_view_tickets BOOLEAN DEFAULT TRUE,
  can_create_ticket BOOLEAN DEFAULT FALSE,
  can_update_ticket BOOLEAN DEFAULT TRUE,
  can_assign_ticket BOOLEAN DEFAULT FALSE,
  can_close_ticket BOOLEAN DEFAULT FALSE,
  can_escalate_ticket BOOLEAN DEFAULT FALSE,
  can_view_internal_notes BOOLEAN DEFAULT FALSE,
  
  -- Priority Access
  can_handle_critical BOOLEAN DEFAULT FALSE,
  can_handle_urgent BOOLEAN DEFAULT FALSE,
  can_handle_high BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(system_user_id)
);

CREATE INDEX IF NOT EXISTS ticket_access_controls_user_id_idx ON ticket_access_controls(system_user_id);

-- Rider Management Access
CREATE TABLE IF NOT EXISTS rider_management_access (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- View Access
  can_view_all_riders BOOLEAN DEFAULT FALSE,
  can_view_assigned_riders BOOLEAN DEFAULT TRUE,
  can_view_rider_financial BOOLEAN DEFAULT FALSE,
  can_view_rider_documents BOOLEAN DEFAULT FALSE,
  
  -- Onboarding Access
  can_update_onboarding BOOLEAN DEFAULT FALSE,
  can_approve_documents BOOLEAN DEFAULT FALSE,
  can_reject_documents BOOLEAN DEFAULT FALSE,
  can_approve_rider BOOLEAN DEFAULT FALSE,
  can_reject_rider BOOLEAN DEFAULT FALSE,
  
  -- Operational Access
  can_activate_rider BOOLEAN DEFAULT FALSE,
  can_deactivate_rider BOOLEAN DEFAULT FALSE,
  can_block_rider BOOLEAN DEFAULT FALSE,
  can_unblock_rider BOOLEAN DEFAULT FALSE,
  
  -- Financial Access
  can_add_penalty BOOLEAN DEFAULT FALSE,
  can_revert_penalty BOOLEAN DEFAULT FALSE,
  can_adjust_wallet BOOLEAN DEFAULT FALSE,
  can_approve_withdrawal BOOLEAN DEFAULT FALSE,
  can_close_wallet BOOLEAN DEFAULT FALSE,
  can_update_payment_info BOOLEAN DEFAULT FALSE,
  
  -- Assignment Access
  can_assign_to_area BOOLEAN DEFAULT FALSE,
  can_remove_from_area BOOLEAN DEFAULT FALSE,
  
  -- Limits
  penalty_approval_limit NUMERIC(10, 2) DEFAULT 0,
  wallet_adjustment_limit NUMERIC(10, 2) DEFAULT 0,
  withdrawal_approval_limit NUMERIC(12, 2) DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(system_user_id)
);

CREATE INDEX IF NOT EXISTS rider_management_access_user_id_idx ON rider_management_access(system_user_id);

-- Merchant Management Access
CREATE TABLE IF NOT EXISTS merchant_management_access (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- View Access
  can_view_all_merchants BOOLEAN DEFAULT FALSE,
  can_view_assigned_merchants BOOLEAN DEFAULT TRUE,
  can_view_financial BOOLEAN DEFAULT FALSE,
  can_view_documents BOOLEAN DEFAULT FALSE,
  
  -- Onboarding Access
  can_update_onboarding BOOLEAN DEFAULT FALSE,
  can_approve_documents BOOLEAN DEFAULT FALSE,
  can_reject_documents BOOLEAN DEFAULT FALSE,
  can_approve_store BOOLEAN DEFAULT FALSE,
  can_reject_store BOOLEAN DEFAULT FALSE,
  
  -- Store Management
  can_update_store_details BOOLEAN DEFAULT FALSE,
  can_update_store_timing BOOLEAN DEFAULT FALSE,
  can_update_store_availability BOOLEAN DEFAULT FALSE,
  can_delist_store BOOLEAN DEFAULT FALSE,
  can_relist_store BOOLEAN DEFAULT FALSE,
  can_block_store BOOLEAN DEFAULT FALSE,
  can_unblock_store BOOLEAN DEFAULT FALSE,
  
  -- Menu Management
  can_view_menu BOOLEAN DEFAULT TRUE,
  can_update_menu BOOLEAN DEFAULT FALSE,
  can_update_pricing BOOLEAN DEFAULT FALSE,
  can_update_customizations BOOLEAN DEFAULT FALSE,
  can_update_offers BOOLEAN DEFAULT FALSE,
  
  -- Financial Access
  can_update_bank_details BOOLEAN DEFAULT FALSE,
  can_approve_payout BOOLEAN DEFAULT FALSE,
  can_adjust_commission BOOLEAN DEFAULT FALSE,
  
  -- Order Management
  can_manage_store_orders BOOLEAN DEFAULT FALSE,
  
  -- Limits
  payout_approval_limit NUMERIC(12, 2) DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(system_user_id)
);

CREATE INDEX IF NOT EXISTS merchant_management_access_user_id_idx ON merchant_management_access(system_user_id);

-- Customer Management Access
CREATE TABLE IF NOT EXISTS customer_management_access (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- View Access
  can_view_customer_profile BOOLEAN DEFAULT TRUE,
  can_view_customer_orders BOOLEAN DEFAULT TRUE,
  can_view_customer_financial BOOLEAN DEFAULT FALSE,
  can_view_customer_pii BOOLEAN DEFAULT FALSE, -- Personally Identifiable Information
  
  -- Update Access
  can_update_customer_details BOOLEAN DEFAULT FALSE,
  can_update_customer_addresses BOOLEAN DEFAULT FALSE,
  can_update_payment_methods BOOLEAN DEFAULT FALSE,
  
  -- Action Access
  can_block_customer BOOLEAN DEFAULT FALSE,
  can_unblock_customer BOOLEAN DEFAULT FALSE,
  can_block_device BOOLEAN DEFAULT FALSE,
  can_reset_password BOOLEAN DEFAULT FALSE,
  
  -- Financial Access
  can_process_refund BOOLEAN DEFAULT FALSE,
  can_adjust_wallet BOOLEAN DEFAULT FALSE,
  can_issue_coupon BOOLEAN DEFAULT FALSE,
  
  -- Support Access
  can_view_tickets BOOLEAN DEFAULT TRUE,
  can_respond_to_tickets BOOLEAN DEFAULT TRUE,
  
  -- Limits
  refund_approval_limit NUMERIC(12, 2) DEFAULT 0,
  wallet_adjustment_limit NUMERIC(10, 2) DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(system_user_id)
);

CREATE INDEX IF NOT EXISTS customer_management_access_user_id_idx ON customer_management_access(system_user_id);

-- Payment Access Controls
CREATE TABLE IF NOT EXISTS payment_access_controls (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- View Access
  can_view_all_payments BOOLEAN DEFAULT FALSE,
  can_view_payment_details BOOLEAN DEFAULT FALSE,
  can_view_gateway_response BOOLEAN DEFAULT FALSE,
  
  -- Action Access
  can_process_refund BOOLEAN DEFAULT FALSE,
  can_approve_refund BOOLEAN DEFAULT FALSE,
  can_cancel_payment BOOLEAN DEFAULT FALSE,
  can_retry_payment BOOLEAN DEFAULT FALSE,
  
  -- Limits
  refund_approval_limit NUMERIC(12, 2) DEFAULT 0,
  daily_refund_limit NUMERIC(12, 2) DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(system_user_id)
);

CREATE INDEX IF NOT EXISTS payment_access_controls_user_id_idx ON payment_access_controls(system_user_id);

-- Payout Access Controls
CREATE TABLE IF NOT EXISTS payout_access_controls (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- View Access
  can_view_all_payouts BOOLEAN DEFAULT FALSE,
  can_view_payout_details BOOLEAN DEFAULT FALSE,
  can_view_bank_details BOOLEAN DEFAULT FALSE,
  
  -- Action Access
  can_process_merchant_payout BOOLEAN DEFAULT FALSE,
  can_process_rider_payout BOOLEAN DEFAULT FALSE,
  can_approve_payout BOOLEAN DEFAULT FALSE,
  can_reject_payout BOOLEAN DEFAULT FALSE,
  can_hold_payout BOOLEAN DEFAULT FALSE,
  
  -- Limits
  merchant_payout_approval_limit NUMERIC(12, 2) DEFAULT 0,
  rider_payout_approval_limit NUMERIC(12, 2) DEFAULT 0,
  daily_payout_limit NUMERIC(12, 2) DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(system_user_id)
);

CREATE INDEX IF NOT EXISTS payout_access_controls_user_id_idx ON payout_access_controls(system_user_id);

-- Refund Access Controls
CREATE TABLE IF NOT EXISTS refund_access_controls (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Refund Type Access
  can_process_full_refund BOOLEAN DEFAULT FALSE,
  can_process_partial_refund BOOLEAN DEFAULT FALSE,
  can_process_item_refund BOOLEAN DEFAULT FALSE,
  
  -- Approval Access
  can_approve_customer_refund BOOLEAN DEFAULT FALSE,
  can_approve_merchant_refund BOOLEAN DEFAULT FALSE,
  can_approve_rider_refund BOOLEAN DEFAULT FALSE,
  
  -- Limits
  full_refund_approval_limit NUMERIC(12, 2) DEFAULT 0,
  partial_refund_approval_limit NUMERIC(12, 2) DEFAULT 0,
  daily_refund_approval_limit NUMERIC(12, 2) DEFAULT 0,
  
  -- Auto-Approval
  can_auto_approve_under_limit BOOLEAN DEFAULT FALSE,
  auto_approval_limit NUMERIC(10, 2) DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(system_user_id)
);

CREATE INDEX IF NOT EXISTS refund_access_controls_user_id_idx ON refund_access_controls(system_user_id);

-- Offer Management Access
CREATE TABLE IF NOT EXISTS offer_management_access (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Offer Target
  customer_offer_access BOOLEAN DEFAULT FALSE,
  merchant_offer_access BOOLEAN DEFAULT FALSE,
  rider_offer_access BOOLEAN DEFAULT FALSE,
  
  -- Actions
  can_create_offer BOOLEAN DEFAULT FALSE,
  can_update_offer BOOLEAN DEFAULT FALSE,
  can_activate_offer BOOLEAN DEFAULT FALSE,
  can_deactivate_offer BOOLEAN DEFAULT FALSE,
  can_delete_offer BOOLEAN DEFAULT FALSE,
  
  -- Approval
  requires_approval BOOLEAN DEFAULT TRUE,
  can_approve_offer BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(system_user_id)
);

CREATE INDEX IF NOT EXISTS offer_management_access_user_id_idx ON offer_management_access(system_user_id);

-- Advertisement Management Access
CREATE TABLE IF NOT EXISTS advertisement_management_access (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Ad Type Access
  can_create_banner_ad BOOLEAN DEFAULT FALSE,
  can_create_popup_ad BOOLEAN DEFAULT FALSE,
  can_create_listing_ad BOOLEAN DEFAULT FALSE,
  
  -- Target Access
  customer_app_access BOOLEAN DEFAULT FALSE,
  merchant_app_access BOOLEAN DEFAULT FALSE,
  rider_app_access BOOLEAN DEFAULT FALSE,
  
  -- Actions
  can_update_ad BOOLEAN DEFAULT FALSE,
  can_activate_ad BOOLEAN DEFAULT FALSE,
  can_deactivate_ad BOOLEAN DEFAULT FALSE,
  can_view_ad_analytics BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(system_user_id)
);

CREATE INDEX IF NOT EXISTS advertisement_management_access_user_id_idx ON advertisement_management_access(system_user_id);

-- ============================================================================
-- PHASE 6: AUDIT & COMPLIANCE
-- ============================================================================

-- System Audit Logs (Complete Audit Trail)
CREATE TABLE IF NOT EXISTS system_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  
  -- Actor
  system_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
  system_user_name TEXT,
  role_at_time TEXT,
  
  -- Action Details
  module_name access_module NOT NULL,
  action_type TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'BLOCK', etc.
  action_description TEXT,
  
  -- Entity
  entity_type TEXT NOT NULL, -- 'ORDER', 'RIDER', 'MERCHANT', 'CUSTOMER', 'PAYOUT', 'TICKET'
  entity_id TEXT NOT NULL,
  
  -- Changes
  old_data JSONB,
  new_data JSONB,
  changed_fields TEXT[],
  
  -- Context
  ip_address TEXT,
  device_info TEXT,
  user_agent TEXT,
  session_id BIGINT REFERENCES system_user_sessions(id) ON DELETE SET NULL,
  
  -- Location
  location_city TEXT,
  location_country TEXT,
  
  -- Additional Context
  request_id TEXT,
  api_endpoint TEXT,
  http_method TEXT,
  
  -- Metadata
  audit_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS system_audit_logs_user_id_idx ON system_audit_logs(system_user_id);
CREATE INDEX IF NOT EXISTS system_audit_logs_module_idx ON system_audit_logs(module_name);
CREATE INDEX IF NOT EXISTS system_audit_logs_action_type_idx ON system_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS system_audit_logs_entity_idx ON system_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS system_audit_logs_created_at_idx ON system_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS system_audit_logs_user_created_idx ON system_audit_logs(system_user_id, created_at DESC);

-- Access Activity Logs (UI/API Access Tracking)
CREATE TABLE IF NOT EXISTS access_activity_logs (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Access Details
  access_type TEXT NOT NULL, -- 'PAGE_VIEW', 'API_CALL', 'ACTION_PERFORMED'
  page_name TEXT,
  api_endpoint TEXT,
  http_method TEXT,
  
  -- Action
  action_performed TEXT,
  action_result TEXT, -- 'SUCCESS', 'FAILED', 'UNAUTHORIZED', 'FORBIDDEN'
  
  -- Context
  ip_address TEXT,
  device_info TEXT,
  session_id BIGINT REFERENCES system_user_sessions(id) ON DELETE SET NULL,
  
  -- Performance
  response_time_ms INTEGER,
  
  -- Metadata
  request_params JSONB DEFAULT '{}',
  response_data JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS access_activity_logs_user_id_idx ON access_activity_logs(system_user_id);
CREATE INDEX IF NOT EXISTS access_activity_logs_access_type_idx ON access_activity_logs(access_type);
CREATE INDEX IF NOT EXISTS access_activity_logs_action_result_idx ON access_activity_logs(action_result);
CREATE INDEX IF NOT EXISTS access_activity_logs_created_at_idx ON access_activity_logs(created_at);

-- Permission Change Logs
CREATE TABLE IF NOT EXISTS permission_change_logs (
  id BIGSERIAL PRIMARY KEY,
  
  -- Target User
  target_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  target_user_name TEXT,
  
  -- Change Details
  change_type TEXT NOT NULL, -- 'ROLE_ASSIGNED', 'ROLE_REVOKED', 'PERMISSION_GRANTED', 'PERMISSION_REVOKED'
  
  -- Role/Permission
  role_id BIGINT REFERENCES system_roles(id) ON DELETE SET NULL,
  role_name TEXT,
  permission_id BIGINT REFERENCES system_permissions(id) ON DELETE SET NULL,
  permission_name TEXT,
  
  -- Actor
  changed_by BIGINT NOT NULL REFERENCES system_users(id),
  changed_by_name TEXT,
  change_reason TEXT,
  
  -- Before/After
  access_before JSONB,
  access_after JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS permission_change_logs_target_user_id_idx ON permission_change_logs(target_user_id);
CREATE INDEX IF NOT EXISTS permission_change_logs_changed_by_idx ON permission_change_logs(changed_by);
CREATE INDEX IF NOT EXISTS permission_change_logs_change_type_idx ON permission_change_logs(change_type);
CREATE INDEX IF NOT EXISTS permission_change_logs_created_at_idx ON permission_change_logs(created_at);

-- Security Events
CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL PRIMARY KEY,
  
  -- Event Details
  event_type TEXT NOT NULL, -- 'UNAUTHORIZED_ACCESS', 'FAILED_LOGIN', 'PERMISSION_VIOLATION', 'SUSPICIOUS_ACTIVITY'
  event_severity TEXT NOT NULL DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  event_description TEXT NOT NULL,
  
  -- Actor (if known)
  system_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
  system_user_name TEXT,
  
  -- Context
  ip_address TEXT,
  device_info TEXT,
  user_agent TEXT,
  
  -- Target
  target_resource TEXT,
  attempted_action TEXT,
  
  -- Detection
  detected_by TEXT, -- 'SYSTEM', 'MANUAL', 'AUTOMATED_RULE'
  
  -- Response
  action_taken TEXT,
  action_taken_by BIGINT REFERENCES system_users(id),
  action_taken_at TIMESTAMP WITH TIME ZONE,
  
  -- Resolution
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  
  -- Metadata
  event_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS security_events_event_type_idx ON security_events(event_type);
CREATE INDEX IF NOT EXISTS security_events_event_severity_idx ON security_events(event_severity);
CREATE INDEX IF NOT EXISTS security_events_user_id_idx ON security_events(system_user_id);
CREATE INDEX IF NOT EXISTS security_events_is_resolved_idx ON security_events(is_resolved) WHERE is_resolved = FALSE;
CREATE INDEX IF NOT EXISTS security_events_created_at_idx ON security_events(created_at);

-- Compliance Audit Trail
CREATE TABLE IF NOT EXISTS compliance_audit_trail (
  id BIGSERIAL PRIMARY KEY,
  
  -- Compliance Type
  compliance_type TEXT NOT NULL, -- 'DATA_ACCESS', 'DATA_EXPORT', 'DATA_DELETION', 'FINANCIAL_TRANSACTION', 'REGULATORY_REPORT'
  compliance_category TEXT, -- 'GDPR', 'PCI_DSS', 'SOC2', 'ISO27001'
  
  -- Actor
  system_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
  system_user_name TEXT,
  role_at_time TEXT,
  
  -- Action
  action_performed TEXT NOT NULL,
  action_justification TEXT,
  
  -- Scope
  affected_entities JSONB DEFAULT '[]', -- Array of {entity_type, entity_id}
  affected_customer_count INTEGER DEFAULT 0,
  
  -- Data
  data_accessed BOOLEAN DEFAULT FALSE,
  data_exported BOOLEAN DEFAULT FALSE,
  data_modified BOOLEAN DEFAULT FALSE,
  data_deleted BOOLEAN DEFAULT FALSE,
  
  -- Approval
  approval_required BOOLEAN DEFAULT FALSE,
  approved_by BIGINT REFERENCES system_users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  compliance_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS compliance_audit_trail_compliance_type_idx ON compliance_audit_trail(compliance_type);
CREATE INDEX IF NOT EXISTS compliance_audit_trail_user_id_idx ON compliance_audit_trail(system_user_id);
CREATE INDEX IF NOT EXISTS compliance_audit_trail_created_at_idx ON compliance_audit_trail(created_at);

-- ============================================================================
-- PHASE 7: ADVANCED ACCESS FEATURES
-- ============================================================================

-- Access Delegation (Temporary Permission Transfer)
CREATE TABLE IF NOT EXISTS access_delegation (
  id BIGSERIAL PRIMARY KEY,
  
  -- Delegator (who delegates)
  delegator_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  delegator_name TEXT,
  
  -- Delegate (who receives)
  delegate_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  delegate_name TEXT,
  
  -- Delegation Scope
  delegated_permissions BIGINT[], -- Array of permission IDs
  delegated_roles BIGINT[], -- Array of role IDs
  
  -- Reason
  delegation_reason TEXT NOT NULL,
  
  -- Validity
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  revoked_by BIGINT REFERENCES system_users(id),
  revoke_reason TEXT,
  
  -- Approval
  approved_by BIGINT REFERENCES system_users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS access_delegation_delegator_idx ON access_delegation(delegator_user_id);
CREATE INDEX IF NOT EXISTS access_delegation_delegate_idx ON access_delegation(delegate_user_id);
CREATE INDEX IF NOT EXISTS access_delegation_is_active_idx ON access_delegation(is_active) WHERE is_active = TRUE;

-- Access Approval Workflows
CREATE TABLE IF NOT EXISTS access_approval_workflows (
  id BIGSERIAL PRIMARY KEY,
  workflow_id TEXT NOT NULL UNIQUE,
  
  -- Workflow Details
  workflow_name TEXT NOT NULL,
  workflow_description TEXT,
  
  -- Trigger
  trigger_action TEXT NOT NULL, -- What action triggers this workflow
  trigger_module access_module NOT NULL,
  
  -- Approval Chain
  approval_chain JSONB NOT NULL, -- Array of {role_id, user_id, order}
  requires_all_approvals BOOLEAN DEFAULT FALSE,
  
  -- Conditions
  conditions JSONB DEFAULT '{}', -- When this workflow applies
  
  -- Timeout
  approval_timeout_hours INTEGER DEFAULT 24,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS access_approval_workflows_workflow_id_idx ON access_approval_workflows(workflow_id);
CREATE INDEX IF NOT EXISTS access_approval_workflows_trigger_module_idx ON access_approval_workflows(trigger_module);

-- Access Approval Requests
CREATE TABLE IF NOT EXISTS access_approval_requests (
  id BIGSERIAL PRIMARY KEY,
  workflow_id BIGINT NOT NULL REFERENCES access_approval_workflows(id) ON DELETE CASCADE,
  
  -- Requester
  requester_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  requester_name TEXT,
  
  -- Request Details
  request_type TEXT NOT NULL,
  request_reason TEXT NOT NULL,
  request_data JSONB DEFAULT '{}',
  
  -- Entity
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  
  -- Approvals
  pending_approvers BIGINT[], -- Array of user IDs
  approved_by BIGINT[],
  rejected_by BIGINT,
  
  -- Status
  approval_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'
  
  -- Result
  final_decision TEXT,
  decision_notes TEXT,
  decided_at TIMESTAMP WITH TIME ZONE,
  
  -- Expiry
  expires_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS access_approval_requests_workflow_id_idx ON access_approval_requests(workflow_id);
CREATE INDEX IF NOT EXISTS access_approval_requests_requester_id_idx ON access_approval_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS access_approval_requests_approval_status_idx ON access_approval_requests(approval_status);

-- Access Restrictions (Time/IP Based)
CREATE TABLE IF NOT EXISTS access_restrictions (
  id BIGSERIAL PRIMARY KEY,
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  
  -- Restriction Type
  restriction_type TEXT NOT NULL, -- 'TIME_BASED', 'IP_BASED', 'GEO_BASED', 'DEVICE_BASED'
  
  -- Time-Based Restrictions
  allowed_days day_of_week[],
  allowed_time_start TIME,
  allowed_time_end TIME,
  timezone TEXT DEFAULT 'UTC',
  
  -- IP-Based Restrictions
  allowed_ips TEXT[],
  blocked_ips TEXT[],
  
  -- Geo-Based Restrictions
  allowed_countries TEXT[],
  allowed_cities TEXT[],
  
  -- Device-Based Restrictions
  allowed_device_types device_platform[],
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  created_by BIGINT REFERENCES system_users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS access_restrictions_user_id_idx ON access_restrictions(system_user_id);
CREATE INDEX IF NOT EXISTS access_restrictions_restriction_type_idx ON access_restrictions(restriction_type);

-- Access Emergency Mode (Break-Glass Access)
CREATE TABLE IF NOT EXISTS access_emergency_mode (
  id BIGSERIAL PRIMARY KEY,
  
  -- User
  system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  system_user_name TEXT,
  
  -- Emergency Details
  emergency_reason TEXT NOT NULL,
  emergency_type TEXT NOT NULL, -- 'CRITICAL_INCIDENT', 'SYSTEM_FAILURE', 'SECURITY_BREACH', 'COMPLIANCE_ISSUE'
  
  -- Elevated Permissions
  elevated_permissions BIGINT[], -- Temporarily granted permission IDs
  
  -- Approval
  approved_by BIGINT REFERENCES system_users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  
  -- Duration
  activated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  revoked_by BIGINT REFERENCES system_users(id),
  
  -- Audit
  actions_performed JSONB DEFAULT '[]',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS access_emergency_mode_user_id_idx ON access_emergency_mode(system_user_id);
CREATE INDEX IF NOT EXISTS access_emergency_mode_is_active_idx ON access_emergency_mode(is_active) WHERE is_active = TRUE;

-- Continue in Part 3...
