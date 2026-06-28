# Dashboard Tables Documentation

This document provides a comprehensive reference of all tables currently used in the dashboard project, organized by functional area. This documentation is based on the SQL migration files through 0086 and previous schema files.

**Last Updated**: February 8, 2026  
**Migration Files Analyzed**: 0042 through 0086 (dashboard), 0055-0056 (backend)

**Continued upgrades** (migrations 0080–0086, new tables such as `wallet_credit_requests`, rider schema redesign, onboarding redesign, and Enterprise Ticket System reference) are documented in **[DASHBOARD_TABLES_DOCUMENTATION_PART2.md](DASHBOARD_TABLES_DOCUMENTATION_PART2.md)**.

---

## Table of Contents

1. [Dashboard Access Control](#1-dashboard-access-control)
2. [Authentication & User Management](#2-authentication--user-management)
3. [Audit & Compliance](#3-audit--compliance)
4. [Service Points](#4-service-points)
5. [Ticket System](#5-ticket-system)
6. [Agents Management](#6-agents-management)
7. [3PL Integration](#7-3pl-integration)
8. [Rider Domain](#8-rider-domain)
9. [Order Domain (Hybrid)](#9-order-domain-hybrid)

---

## 1. Dashboard Access Control

### 1.1 `dashboard_access`
**Purpose**: Stores which dashboards each system user can access  
**Migration**: 0042_dashboard_access_control.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `system_user_id` | BIGINT | Foreign key to `system_users.id` (ON DELETE CASCADE) |
| `dashboard_type` | TEXT | Dashboard type: 'RIDER', 'MERCHANT', 'CUSTOMER', 'ORDER_FOOD', 'ORDER_PARCEL', 'ORDER_PERSON_RIDE', 'TICKET', 'OFFER', 'AREA_MANAGER', 'PAYMENT', 'SYSTEM', 'ANALYTICS' |
| `order_type` | TEXT | Order type for order-related dashboards: 'food', 'parcel', 'person_ride', or NULL for all |
| `access_level` | TEXT | Access level: 'VIEW_ONLY', 'FULL_ACCESS', 'RESTRICTED' (default: 'VIEW_ONLY') |
| `is_active` | BOOLEAN | Whether access is active (default: TRUE) |
| `granted_by` | BIGINT | Foreign key to `system_users.id` (who granted access) |
| `granted_by_name` | TEXT | Name of user who granted access |
| `granted_at` | TIMESTAMP WITH TIME ZONE | When access was granted (default: NOW()) |
| `revoked_at` | TIMESTAMP WITH TIME ZONE | When access was revoked |
| `revoked_by` | BIGINT | Foreign key to `system_users.id` (who revoked access) |
| `revoke_reason` | TEXT | Reason for revocation |
| `created_at` | TIMESTAMP WITH TIME ZONE | Record creation timestamp |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Record update timestamp |

**Constraints**:
- UNIQUE(`system_user_id`, `dashboard_type`)

**Indexes**:
- `dashboard_access_user_id_idx` on `system_user_id`
- `dashboard_access_dashboard_type_idx` on `dashboard_type`
- `dashboard_access_is_active_idx` on `is_active` WHERE `is_active = TRUE`
- `dashboard_access_order_type_idx` on `order_type` WHERE `order_type IS NOT NULL`

**Notes**:
- For CUSTOMER and TICKET dashboards, `order_type` is NULL (consolidated dashboards)
- For ORDER dashboards, `order_type` specifies which order type the user can access
- Consolidated from previous separate dashboards (CUSTOMER_FOOD, CUSTOMER_PARCEL, etc.) in migration 0052

---

### 1.2 `dashboard_access_points`
**Purpose**: Stores grouped access points (actions) within each dashboard for granular permission control  
**Migration**: 0042_dashboard_access_control.sql, 0053_add_service_based_access_control.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `system_user_id` | BIGINT | Foreign key to `system_users.id` (ON DELETE CASCADE) |
| `dashboard_type` | TEXT | Dashboard type (references `dashboard_access.dashboard_type`) |
| `order_type` | TEXT | Service type for service-specific access: 'food', 'parcel', 'person_ride', or NULL for global access |
| `access_point_group` | TEXT | Access point group identifier (e.g., 'RIDER_VIEW', 'RIDER_ACTIONS_FOOD', 'TICKET_VIEW_FOOD', 'ORDER_ASSIGN', 'ORDER_CANCEL') |
| `access_point_name` | TEXT | Display name for the access point |
| `access_point_description` | TEXT | Description of what this access point allows |
| `allowed_actions` | JSONB | Array of allowed actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'ASSIGN', 'CANCEL', 'REFUND', etc.] (default: '[]') |
| `context` | JSONB | Additional context/metadata (default: '{}') |
| `is_active` | BOOLEAN | Whether access point is active (default: TRUE) |
| `granted_by` | BIGINT | Foreign key to `system_users.id` |
| `granted_by_name` | TEXT | Name of user who granted access |
| `granted_at` | TIMESTAMP WITH TIME ZONE | When access was granted (default: NOW()) |
| `revoked_at` | TIMESTAMP WITH TIME ZONE | When access was revoked |
| `revoked_by` | BIGINT | Foreign key to `system_users.id` |
| `revoke_reason` | TEXT | Reason for revocation |
| `created_at` | TIMESTAMP WITH TIME ZONE | Record creation timestamp |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Record update timestamp |

**Constraints**:
- UNIQUE(`system_user_id`, `dashboard_type`, `access_point_group`, `order_type`) WHERE `is_active = TRUE` (via unique index)

**Indexes**:
- `dashboard_access_points_user_id_idx` on `system_user_id`
- `dashboard_access_points_dashboard_type_idx` on `dashboard_type`
- `dashboard_access_points_group_idx` on `access_point_group`
- `dashboard_access_points_is_active_idx` on `is_active` WHERE `is_active = TRUE`
- `dashboard_access_points_order_type_idx` on `order_type` WHERE `order_type IS NOT NULL`
- `dashboard_access_points_unique_idx` on (`system_user_id`, `dashboard_type`, `access_point_group`, `order_type`) WHERE `is_active = TRUE`
- `dashboard_access_points_service_type_idx` on (`dashboard_type`, `order_type`, `access_point_group`) WHERE `order_type IS NOT NULL AND is_active = TRUE`

**Access Point Groups** (Examples):
- **RIDER**: `RIDER_VIEW`, `RIDER_ACTIONS_FOOD`, `RIDER_ACTIONS_PARCEL`, `RIDER_ACTIONS_PERSON_RIDE`
- **CUSTOMER**: `CUSTOMER_VIEW`, `CUSTOMER_ACTIONS_FOOD`, `CUSTOMER_ACTIONS_PARCEL`, `CUSTOMER_ACTIONS_PERSON_RIDE`
- **TICKET**: `TICKET_VIEW_FOOD`, `TICKET_VIEW_PARCEL`, `TICKET_VIEW_PERSON_RIDE`, `TICKET_ACTIONS_FOOD`, `TICKET_ACTIONS_PARCEL`, `TICKET_ACTIONS_PERSON_RIDE`
- **ORDER**: `ORDER_VIEW`, `ORDER_ASSIGN`, `ORDER_CANCEL`, `ORDER_REFUND`

**Notes**:
- Service-based access control added in migration 0053
- `order_type` is used for RIDER, TICKET, and CUSTOMER dashboards to provide service-specific access
- Global access points (like RIDER_VIEW) have `order_type = NULL`

---

## 2. Authentication & User Management

### 2.1 `system_users`
**Purpose**: Core user accounts for dashboard access (agents, admins, area managers, etc.)  
**Migration**: 0016_access_management_complete.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `system_user_id` | TEXT | Unique identifier (UNIQUE, NOT NULL) |
| `full_name` | TEXT | Full name (NOT NULL) |
| `first_name` | TEXT | First name |
| `last_name` | TEXT | Last name |
| `email` | TEXT | Email address (UNIQUE, NOT NULL) |
| `mobile` | TEXT | Mobile number (NOT NULL) |
| `alternate_mobile` | TEXT | Alternate mobile number |
| `primary_role` | system_user_role_type | Primary role enum (NOT NULL): SUPER_ADMIN, ADMIN, AGENT, AREA_MANAGER_MERCHANT, AREA_MANAGER_RIDER, SALES_TEAM, ADVERTISEMENT_TEAM, AUDIT_TEAM, COMPLIANCE_TEAM, SUPPORT_L1, SUPPORT_L2, SUPPORT_L3, FINANCE_TEAM, OPERATIONS_TEAM, DEVELOPER, READ_ONLY, MANAGER, SUPERVISOR, TEAM_LEAD, COORDINATOR, ANALYST, SPECIALIST, CONSULTANT, INTERN, TRAINEE, QA_ENGINEER, PRODUCT_MANAGER, PROJECT_MANAGER, HR_TEAM, MARKETING_TEAM, CUSTOMER_SUCCESS, DATA_ANALYST, BUSINESS_ANALYST |
| `role_display_name` | TEXT | Display name for role |
| `subrole` | TEXT | Subrole within primary role (e.g., Senior, TL, Manager) - Added in 0043 |
| `subrole_other` | TEXT | Manual subrole entry when "Other" is selected - Added in 0043 |
| `department` | TEXT | Department name |
| `team` | TEXT | Team name |
| `reports_to_id` | BIGINT | Foreign key to `system_users.id` (manager) |
| `manager_name` | TEXT | Manager name |
| `status` | system_user_status | Status enum (NOT NULL, default: 'PENDING_ACTIVATION'): ACTIVE, SUSPENDED, DISABLED, PENDING_ACTIVATION, LOCKED |
| `status_reason` | TEXT | Reason for current status |
| `suspension_expires_at` | TIMESTAMP WITH TIME ZONE | Timestamp when temporary suspension expires (NULL for permanent suspensions) - Added in 0054 |
| `is_email_verified` | BOOLEAN | Email verification status (default: FALSE) |
| `is_mobile_verified` | BOOLEAN | Mobile verification status (default: FALSE) |
| `two_factor_enabled` | BOOLEAN | 2FA enabled status (default: FALSE) |
| `last_login_at` | TIMESTAMP WITH TIME ZONE | Last login timestamp |
| `last_activity_at` | TIMESTAMP WITH TIME ZONE | Last activity timestamp |
| `login_count` | INTEGER | Total login count (default: 0) |
| `failed_login_attempts` | INTEGER | Failed login attempts (default: 0) |
| `account_locked_until` | TIMESTAMP WITH TIME ZONE | Account lock expiry timestamp |
| `created_by` | BIGINT | Foreign key to `system_users.id` |
| `created_by_name` | TEXT | Name of creator |
| `approved_by` | BIGINT | Foreign key to `system_users.id` |
| `approved_at` | TIMESTAMP WITH TIME ZONE | Approval timestamp |
| `deleted_at` | TIMESTAMP WITH TIME ZONE | Soft delete timestamp |
| `deleted_by` | BIGINT | User who deleted |
| `created_at` | TIMESTAMP WITH TIME ZONE | Record creation timestamp |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Record update timestamp |

**Indexes**:
- `system_users_system_user_id_idx` on `system_user_id`
- `system_users_email_idx` on `email`
- `system_users_mobile_idx` on `mobile`
- `system_users_primary_role_idx` on `primary_role`
- `system_users_status_idx` on `status`
- `system_users_reports_to_idx` on `reports_to_id`
- `system_users_subrole_idx` on `subrole`
- `system_users_suspension_expires_at_idx` on `suspension_expires_at` WHERE `suspension_expires_at IS NOT NULL AND status = 'SUSPENDED'`

---

### 2.2 `system_user_auth`
**Purpose**: Authentication data (passwords, 2FA, OTP)  
**Migration**: 0016_access_management_complete.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `system_user_id` | BIGINT | Foreign key to `system_users.id` (ON DELETE CASCADE, UNIQUE, NOT NULL) |
| `password_hash` | TEXT | Password hash (NOT NULL) |
| `password_salt` | TEXT | Password salt |
| `password_last_changed_at` | TIMESTAMP WITH TIME ZONE | Last password change timestamp (default: NOW()) |
| `password_expires_at` | TIMESTAMP WITH TIME ZONE | Password expiry timestamp |
| `two_factor_secret` | TEXT | 2FA secret |
| `two_factor_backup_codes` | TEXT[] | 2FA backup codes array |
| `last_otp` | TEXT | Last OTP sent |
| `last_otp_sent_at` | TIMESTAMP WITH TIME ZONE | Last OTP sent timestamp |
| `otp_attempts` | INTEGER | OTP attempt count (default: 0) |
| `security_questions` | JSONB | Security questions (default: '[]') |
| `recovery_email` | TEXT | Recovery email |
| `recovery_mobile` | TEXT | Recovery mobile |
| `created_at` | TIMESTAMP WITH TIME ZONE | Record creation timestamp |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Record update timestamp |

**Indexes**:
- `system_user_auth_system_user_id_idx` on `system_user_id`

---

### 2.3 `system_user_sessions`
**Purpose**: Active user sessions  
**Migration**: 0016_access_management_complete.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `system_user_id` | BIGINT | Foreign key to `system_users.id` (ON DELETE CASCADE, NOT NULL) |
| `session_token` | TEXT | Session token (UNIQUE, NOT NULL) |
| `refresh_token` | TEXT | Refresh token |
| `device_id` | TEXT | Device identifier |
| `device_type` | TEXT | Device type |
| `ip_address` | TEXT | IP address (NOT NULL) |
| `user_agent` | TEXT | User agent string |
| `location_city` | TEXT | Location city |
| `location_country` | TEXT | Location country |
| `is_active` | BOOLEAN | Whether session is active (default: TRUE) |
| `created_at` | TIMESTAMP WITH TIME ZONE | Session creation timestamp (default: NOW()) |
| `expires_at` | TIMESTAMP WITH TIME ZONE | Session expiry timestamp (NOT NULL) |
| `last_activity_at` | TIMESTAMP WITH TIME ZONE | Last activity timestamp (default: NOW()) |
| `logged_out_at` | TIMESTAMP WITH TIME ZONE | Logout timestamp |

**Indexes**:
- `system_user_sessions_system_user_id_idx` on `system_user_id`
- `system_user_sessions_session_token_idx` on `session_token`
- `system_user_sessions_is_active_idx` on `is_active` WHERE `is_active = TRUE`

---

### 2.4 `system_user_login_history`
**Purpose**: Login attempt history  
**Migration**: 0016_access_management_complete.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `system_user_id` | BIGINT | Foreign key to `system_users.id` (ON DELETE CASCADE, NOT NULL) |
| `login_method` | TEXT | Login method: 'PASSWORD', 'OTP', 'SSO', '2FA' (NOT NULL) |
| `login_success` | BOOLEAN | Whether login was successful (NOT NULL) |
| `device_id` | TEXT | Device identifier |
| `device_type` | TEXT | Device type |
| `ip_address` | TEXT | IP address |
| `user_agent` | TEXT | User agent string |
| `location_city` | TEXT | Location city |
| `location_country` | TEXT | Location country |
| `failure_reason` | TEXT | Failure reason (if failed) |
| `failure_code` | TEXT | Failure code (if failed) |
| `session_id` | BIGINT | Foreign key to `system_user_sessions.id` |
| `created_at` | TIMESTAMP WITH TIME ZONE | Login attempt timestamp (default: NOW()) |

**Indexes**:
- `system_user_login_history_user_id_idx` on `system_user_id`
- `system_user_login_history_login_success_idx` on `login_success`
- `system_user_login_history_created_at_idx` on `created_at`

---

## 3. Audit & Compliance

### 3.1 `action_audit_log`
**Purpose**: Tracks all actions performed by agents for audit and compliance  
**Migration**: 0042_dashboard_access_control.sql, 0047_add_order_type_to_access.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `agent_id` | BIGINT | Foreign key to `system_users.id` (NOT NULL) |
| `agent_email` | TEXT | Agent email (NOT NULL) |
| `agent_name` | TEXT | Agent name |
| `agent_role` | TEXT | Agent role |
| `dashboard_type` | TEXT | Dashboard type (NOT NULL) |
| `order_type` | TEXT | Order type for order-related actions - Added in 0047 |
| `action_type` | TEXT | Action type: 'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'CANCEL', 'REFUND', etc. (NOT NULL) |
| `resource_type` | TEXT | Resource type: 'RIDER', 'ORDER', 'TICKET', 'MERCHANT', etc. |
| `resource_id` | TEXT | ID of the resource being acted upon |
| `action_details` | JSONB | Full details of what was changed (default: '{}') |
| `previous_values` | JSONB | Previous state (for updates) |
| `new_values` | JSONB | New state (for updates) |
| `ip_address` | TEXT | IP address |
| `user_agent` | TEXT | User agent string |
| `request_path` | TEXT | Request path |
| `request_method` | TEXT | HTTP method |
| `action_status` | TEXT | Action status: 'SUCCESS', 'FAILED', 'PENDING' (default: 'SUCCESS') |
| `error_message` | TEXT | Error message (if failed) |
| `created_at` | TIMESTAMP WITH TIME ZONE | Action timestamp (default: NOW()) |

**Indexes**:
- `action_audit_log_agent_id_idx` on `agent_id`
- `action_audit_log_dashboard_type_idx` on `dashboard_type`
- `action_audit_log_resource_type_idx` on `resource_type`
- `action_audit_log_created_at_idx` on `created_at`
- `action_audit_log_action_type_idx` on `action_type`
- `action_audit_log_order_type_idx` on `order_type` WHERE `order_type IS NOT NULL`

---

### 3.2 `system_audit_logs`
**Purpose**: Complete audit trail for all system actions  
**Migration**: 0017_access_controls_and_audit.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `system_user_id` | BIGINT | Foreign key to `system_users.id` |
| `system_user_name` | TEXT | User name |
| `role_at_time` | TEXT | Role at time of action |
| `module_name` | access_module | Module enum (NOT NULL): ORDERS, TICKETS, RIDERS, MERCHANTS, CUSTOMERS, PAYMENTS, REFUNDS, PAYOUTS, OFFERS, ADVERTISEMENTS, ANALYTICS, AUDIT, SETTINGS, USERS |
| `action_type` | TEXT | Action type: 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'BLOCK', etc. (NOT NULL) |
| `action_description` | TEXT | Action description |
| `entity_type` | TEXT | Entity type: 'ORDER', 'RIDER', 'MERCHANT', 'CUSTOMER', 'PAYOUT', 'TICKET' (NOT NULL) |
| `entity_id` | TEXT | Entity ID (NOT NULL) |
| `old_data` | JSONB | Old data snapshot |
| `new_data` | JSONB | New data snapshot |
| `changed_fields` | TEXT[] | Array of changed field names |
| `ip_address` | TEXT | IP address |
| `device_info` | TEXT | Device information |
| `user_agent` | TEXT | User agent string |
| `session_id` | BIGINT | Foreign key to `system_user_sessions.id` |
| `location_city` | TEXT | Location city |
| `location_country` | TEXT | Location country |
| `request_id` | TEXT | Request ID |
| `api_endpoint` | TEXT | API endpoint |
| `http_method` | TEXT | HTTP method |
| `audit_metadata` | JSONB | Additional metadata (default: '{}') |
| `created_at` | TIMESTAMP WITH TIME ZONE | Audit log timestamp (default: NOW()) |

**Indexes**:
- `system_audit_logs_user_id_idx` on `system_user_id`
- `system_audit_logs_module_idx` on `module_name`
- `system_audit_logs_action_type_idx` on `action_type`
- `system_audit_logs_entity_idx` on (`entity_type`, `entity_id`)
- `system_audit_logs_created_at_idx` on `created_at`
- `system_audit_logs_user_created_idx` on (`system_user_id`, `created_at DESC`)

---

### 3.3 `access_activity_logs`
**Purpose**: UI/API access tracking  
**Migration**: 0017_access_controls_and_audit.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `system_user_id` | BIGINT | Foreign key to `system_users.id` (ON DELETE CASCADE, NOT NULL) |
| `access_type` | TEXT | Access type: 'PAGE_VIEW', 'API_CALL', 'ACTION_PERFORMED' (NOT NULL) |
| `page_name` | TEXT | Page name |
| `api_endpoint` | TEXT | API endpoint |
| `http_method` | TEXT | HTTP method |
| `action_performed` | TEXT | Action performed |
| `action_result` | TEXT | Action result: 'SUCCESS', 'FAILED', 'UNAUTHORIZED', 'FORBIDDEN' |
| `ip_address` | TEXT | IP address |
| `device_info` | TEXT | Device information |
| `session_id` | BIGINT | Foreign key to `system_user_sessions.id` |
| `response_time_ms` | INTEGER | Response time in milliseconds |
| `request_params` | JSONB | Request parameters (default: '{}') |
| `response_data` | JSONB | Response data (default: '{}') |
| `created_at` | TIMESTAMP WITH TIME ZONE | Activity timestamp (default: NOW()) |

**Indexes**:
- `access_activity_logs_user_id_idx` on `system_user_id`
- `access_activity_logs_access_type_idx` on `access_type`
- `access_activity_logs_action_result_idx` on `action_result`
- `access_activity_logs_created_at_idx` on `created_at`

---

## 4. Service Points

### 4.1 `service_points`
**Purpose**: Stores GatiMitra service point locations across India  
**Migration**: 0045_create_service_points.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `name` | TEXT | Service point name (NOT NULL) |
| `city` | TEXT | City name (NOT NULL) |
| `latitude` | NUMERIC(10, 8) | Latitude coordinate (NOT NULL, constraint: 6-37 for India) |
| `longitude` | NUMERIC(11, 8) | Longitude coordinate (NOT NULL, constraint: 68-98 for India) |
| `address` | TEXT | Full address |
| `is_active` | BOOLEAN | Whether service point is active (NOT NULL, default: TRUE) |
| `created_by` | BIGINT | Foreign key to `system_users.id` |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (default: NOW()) |

**Constraints**:
- `service_points_latitude_check`: `latitude >= 6 AND latitude <= 37`
- `service_points_longitude_check`: `longitude >= 68 AND longitude <= 98`

**Indexes**:
- `service_points_city_idx` on `city`
- `service_points_location_idx` on (`latitude`, `longitude`)
- `service_points_is_active_idx` on `is_active`
- `service_points_created_by_idx` on `created_by`

**Triggers**:
- `service_points_updated_at_trigger`: Auto-updates `updated_at` on row update

---

## 5. Ticket System

### 5.1 `unified_tickets`
**Purpose**: Unified ticket system supporting all ticket types (order-related and non-order-related) from all sources  
**Migration**: 0020_unified_ticket_system.sql, 0050_add_order_type_to_tickets.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `ticket_id` | TEXT | Human-readable ticket ID (e.g., TKT-2024-001234) (UNIQUE, NOT NULL) |
| `ticket_type` | unified_ticket_type | Ticket type enum: 'ORDER_RELATED', 'NON_ORDER_RELATED' (NOT NULL) |
| `ticket_source` | unified_ticket_source | Source enum: 'CUSTOMER', 'RIDER', 'MERCHANT', 'SYSTEM', 'EMAIL', 'AGENT', 'WHATSAPP', 'CALL' (NOT NULL) |
| `service_type` | unified_ticket_service_type | Service type enum: 'FOOD', 'PARCEL', 'RIDE', 'GENERAL' (NOT NULL) |
| `order_type` | TEXT | Order type for order-related tickets: 'food', 'parcel', 'person_ride', or NULL for non-order tickets - Added in 0050 |
| `ticket_title` | unified_ticket_title | Fixed title enum (NOT NULL) - See enum values below |
| `ticket_category` | unified_ticket_category | Category enum: 'ORDER', 'PAYMENT', 'DELIVERY', 'REFUND', 'ACCOUNT', 'TECHNICAL', 'EARNINGS', 'VERIFICATION', 'COMPLAINT', 'FEEDBACK', 'OTHER' (NOT NULL) |
| `order_id` | BIGINT | Foreign key to `orders.id` (ON DELETE SET NULL) |
| `customer_id` | BIGINT | Foreign key to `customers.id` (ON DELETE SET NULL) |
| `rider_id` | INTEGER | Foreign key to `riders.id` (ON DELETE SET NULL) |
| `merchant_store_id` | BIGINT | Foreign key to `merchant_stores.id` (ON DELETE SET NULL) |
| `merchant_parent_id` | BIGINT | Foreign key to `merchant_parents.id` (ON DELETE SET NULL) |
| `raised_by_type` | unified_ticket_source | Who raised the ticket (NOT NULL) |
| `raised_by_id` | BIGINT | ID of person who raised |
| `raised_by_name` | TEXT | Name snapshot |
| `raised_by_mobile` | TEXT | Mobile snapshot |
| `raised_by_email` | TEXT | Email snapshot |
| `subject` | TEXT | Custom subject (NOT NULL) |
| `description` | TEXT | Detailed description (NOT NULL) |
| `attachments` | TEXT[] | URLs to attached files/images |
| `priority` | unified_ticket_priority | Priority enum: 'LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL' (NOT NULL, default: 'MEDIUM') |
| `status` | unified_ticket_status | Status enum: 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'WAITING_FOR_MERCHANT', 'WAITING_FOR_RIDER', 'RESOLVED', 'CLOSED', 'ESCALATED', 'REOPENED', 'CANCELLED' (NOT NULL, default: 'OPEN') |
| `assigned_to_agent_id` | INTEGER | Foreign key to `system_users.id` (ON DELETE SET NULL) |
| `assigned_to_agent_name` | TEXT | Assigned agent name |
| `assigned_at` | TIMESTAMP WITH TIME ZONE | Assignment timestamp |
| `auto_assigned` | BOOLEAN | Whether auto-assigned by system (default: FALSE) |
| `resolution` | TEXT | Resolution text |
| `resolution_time_minutes` | INTEGER | Time taken to resolve in minutes |
| `resolved_at` | TIMESTAMP WITH TIME ZONE | Resolution timestamp |
| `resolved_by` | INTEGER | Foreign key to `system_users.id` |
| `resolved_by_name` | TEXT | Resolver name |
| `escalated` | BOOLEAN | Whether escalated (default: FALSE) |
| `escalated_at` | TIMESTAMP WITH TIME ZONE | Escalation timestamp |
| `escalated_to` | INTEGER | Foreign key to `system_users.id` |
| `escalated_reason` | TEXT | Escalation reason |
| `escalation_level` | INTEGER | Escalation level: 0 = normal, 1+ = escalated (default: 0) |
| `first_response_at` | TIMESTAMP WITH TIME ZONE | First response timestamp |
| `first_response_time_minutes` | INTEGER | Time to first response in minutes |
| `last_response_at` | TIMESTAMP WITH TIME ZONE | Last response timestamp |
| `last_response_by_type` | unified_ticket_source | Who responded last |
| `last_response_by_id` | BIGINT | Last responder ID |
| `follow_up_required` | BOOLEAN | Whether follow-up required (default: FALSE) |
| `follow_up_date` | TIMESTAMP WITH TIME ZONE | Follow-up date |
| `follow_up_notes` | TEXT | Follow-up notes |
| `satisfaction_rating` | SMALLINT | Satisfaction rating 1-5 |
| `satisfaction_feedback` | TEXT | Satisfaction feedback |
| `satisfaction_collected_at` | TIMESTAMP WITH TIME ZONE | Satisfaction collection timestamp |
| `parent_ticket_id` | BIGINT | Foreign key to `unified_tickets.id` (ON DELETE SET NULL) |
| `related_ticket_ids` | BIGINT[] | Array of related ticket IDs |
| `tags` | TEXT[] | Tags for filtering/searching |
| `email_message_id` | TEXT | Original email message ID |
| `email_thread_id` | TEXT | Email thread ID for grouping |
| `email_from_address` | TEXT | Email from address |
| `email_subject` | TEXT | Email subject |
| `auto_generated` | BOOLEAN | Whether auto-generated (default: FALSE) |
| `auto_generation_rule` | TEXT | Rule that triggered auto-generation |
| `auto_generation_metadata` | JSONB | Auto-generation metadata (default: '{}') |
| `metadata` | JSONB | Additional flexible data (default: '{}') |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (default: NOW()) |
| `closed_at` | TIMESTAMP WITH TIME ZONE | Closure timestamp |

**Constraints**:
- `unified_tickets_order_check`: `(ticket_type = 'ORDER_RELATED' AND order_id IS NOT NULL) OR (ticket_type = 'NON_ORDER_RELATED' AND order_id IS NULL)`
- `unified_tickets_raised_by_check`: Validates raised_by_type and related IDs

**Indexes**:
- Multiple indexes on key columns for performance
- GIN indexes on `tags` and `metadata` arrays
- Composite indexes for common query patterns

**Ticket Title Enum Values** (unified_ticket_title):
- **Order-Related**: ORDER_DELAYED, ORDER_NOT_RECEIVED, WRONG_ITEM_DELIVERED, ITEM_MISSING, ORDER_CANCELLED_WRONG, PAYMENT_ISSUE, REFUND_NOT_PROCESSED, ORDER_DAMAGED, ORDER_QUALITY_ISSUE, RIDER_NOT_ARRIVED, RIDER_BEHAVIOUR_ISSUE, MERCHANT_NOT_PREPARING, DELIVERY_ADDRESS_WRONG, ORDER_NOT_ASSIGNED, ORDER_REASSIGNMENT_NEEDED
- **Non-Order-Related (Customer)**: ACCOUNT_ISSUE, PAYMENT_METHOD_ISSUE, WALLET_ISSUE, COUPON_NOT_APPLYING, APP_TECHNICAL_ISSUE, PROFILE_UPDATE_ISSUE, ADDRESS_MANAGEMENT_ISSUE, NOTIFICATION_NOT_RECEIVING
- **Non-Order-Related (Rider)**: EARNINGS_NOT_CREDITED, WALLET_WITHDRAWAL_ISSUE, APP_CRASH_OR_BUG, LOCATION_TRACKING_ISSUE, RIDER_ORDER_NOT_RECEIVING, ONBOARDING_ISSUE, DOCUMENT_VERIFICATION_ISSUE, DUTY_LOG_ISSUE, RATING_DISPUTE
- **Non-Order-Related (Merchant)**: PAYOUT_DELAYED, PAYOUT_NOT_RECEIVED, SETTLEMENT_DISPUTE, COMMISSION_DISPUTE, MENU_UPDATE_ISSUE, STORE_STATUS_ISSUE, MERCHANT_ORDER_NOT_RECEIVING, MERCHANT_APP_TECHNICAL_ISSUE, VERIFICATION_ISSUE
- **General**: OTHER, FEEDBACK, COMPLAINT, SUGGESTION

---

### 5.2 `unified_ticket_messages`
**Purpose**: Conversation thread for tickets  
**Migration**: 0020_unified_ticket_system.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `ticket_id` | BIGINT | Foreign key to `unified_tickets.id` (ON DELETE CASCADE, NOT NULL) |
| `message_text` | TEXT | Message text (NOT NULL) |
| `message_type` | TEXT | Message type: 'TEXT', 'IMAGE', 'FILE', 'SYSTEM', 'EMAIL' (NOT NULL, default: 'TEXT') |
| `sender_type` | unified_ticket_source | Sender type enum (NOT NULL) |
| `sender_id` | BIGINT | Sender ID |
| `sender_name` | TEXT | Sender name |
| `sender_email` | TEXT | Sender email |
| `sender_mobile` | TEXT | Sender mobile |
| `attachments` | TEXT[] | URLs to files/images |
| `is_internal_note` | BOOLEAN | Whether internal note (agents only) (default: FALSE) |
| `internal_note_for_agent_id` | INTEGER | Foreign key to `system_users.id` |
| `is_read` | BOOLEAN | Whether message is read (default: FALSE) |
| `read_at` | TIMESTAMP WITH TIME ZONE | Read timestamp |
| `read_by` | INTEGER | Foreign key to `system_users.id` |
| `email_message_id` | TEXT | Email message ID |
| `email_in_reply_to` | TEXT | Email in-reply-to header |
| `created_at` | TIMESTAMP WITH TIME ZONE | Message timestamp (default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (default: NOW()) |

**Indexes**:
- `unified_ticket_messages_ticket_id_idx` on `ticket_id`
- `unified_ticket_messages_sender_type_idx` on `sender_type`
- `unified_ticket_messages_sender_id_idx` on `sender_id` WHERE `sender_id IS NOT NULL`
- `unified_ticket_messages_created_at_idx` on `created_at`
- `unified_ticket_messages_is_internal_note_idx` on `is_internal_note`

---

### 5.3 `unified_ticket_activities`
**Purpose**: Complete audit trail of all ticket activities and changes  
**Migration**: 0020_unified_ticket_system.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `ticket_id` | BIGINT | Foreign key to `unified_tickets.id` (ON DELETE CASCADE, NOT NULL) |
| `activity_type` | TEXT | Activity type: 'CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ESCALATED', 'RESOLVED', 'CLOSED', 'REOPENED', 'MESSAGE_ADDED', etc. (NOT NULL) |
| `activity_description` | TEXT | Activity description (NOT NULL) |
| `actor_type` | unified_ticket_source | Actor type enum (NOT NULL) |
| `actor_id` | BIGINT | Actor ID |
| `actor_name` | TEXT | Actor name |
| `old_value` | JSONB | Old value snapshot |
| `new_value` | JSONB | New value snapshot |
| `created_at` | TIMESTAMP WITH TIME ZONE | Activity timestamp (default: NOW()) |

**Indexes**:
- `unified_ticket_activities_ticket_id_idx` on `ticket_id`
- `unified_ticket_activities_activity_type_idx` on `activity_type`
- `unified_ticket_activities_actor_type_idx` on `actor_type`
- `unified_ticket_activities_created_at_idx` on `created_at`

---

### 5.4 `ticket_access_controls`
**Purpose**: Ticket access control for agents  
**Migration**: 0017_access_controls_and_audit.sql, 0050_add_order_type_to_tickets.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `system_user_id` | BIGINT | Foreign key to `system_users.id` (ON DELETE CASCADE, NOT NULL, UNIQUE) |
| `customer_ticket_access` | BOOLEAN | Can access customer tickets (default: TRUE) |
| `rider_ticket_access` | BOOLEAN | Can access rider tickets (default: FALSE) |
| `merchant_ticket_access` | BOOLEAN | Can access merchant tickets (default: FALSE) |
| `order_type` | TEXT | Order type for ticket access control: 'food', 'parcel', 'person_ride', or NULL for all - Added in 0050 |
| `can_view_tickets` | BOOLEAN | Can view tickets (default: TRUE) |
| `can_create_ticket` | BOOLEAN | Can create tickets (default: FALSE) |
| `can_update_ticket` | BOOLEAN | Can update tickets (default: TRUE) |
| `can_assign_ticket` | BOOLEAN | Can assign tickets (default: FALSE) |
| `can_close_ticket` | BOOLEAN | Can close tickets (default: FALSE) |
| `can_escalate_ticket` | BOOLEAN | Can escalate tickets (default: FALSE) |
| `can_view_internal_notes` | BOOLEAN | Can view internal notes (default: FALSE) |
| `can_handle_critical` | BOOLEAN | Can handle critical priority (default: FALSE) |
| `can_handle_urgent` | BOOLEAN | Can handle urgent priority (default: FALSE) |
| `can_handle_high` | BOOLEAN | Can handle high priority (default: TRUE) |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (default: NOW()) |

**Indexes**:
- `ticket_access_controls_user_id_idx` on `system_user_id`

---

### 5.5 `ticket_title_config`
**Purpose**: Configuration table for fixed ticket titles - ensures consistency  
**Migration**: 0020_unified_ticket_system.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `ticket_title` | unified_ticket_title | Ticket title enum (UNIQUE, NOT NULL) |
| `display_name` | TEXT | Human-readable name (NOT NULL) |
| `description` | TEXT | Description of when to use this title |
| `applicable_to_ticket_type` | unified_ticket_type[] | Which ticket types can use this |
| `applicable_to_service_type` | unified_ticket_service_type[] | Which services can use this |
| `applicable_to_source` | unified_ticket_source[] | Which sources can use this |
| `default_priority` | unified_ticket_priority | Default priority |
| `default_category` | unified_ticket_category | Default category |
| `default_auto_assign` | BOOLEAN | Default auto-assign (default: FALSE) |
| `default_auto_assign_to_agent_id` | INTEGER | Foreign key to `system_users.id` |
| `is_active` | BOOLEAN | Whether title is active (default: TRUE) |
| `display_order` | INTEGER | For UI ordering (default: 0) |
| `metadata` | JSONB | Additional metadata (default: '{}') |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (default: NOW()) |

**Indexes**:
- `ticket_title_config_ticket_title_idx` on `ticket_title`
- `ticket_title_config_is_active_idx` on `is_active`
- `ticket_title_config_display_order_idx` on `display_order`

---

### 5.6 `ticket_auto_generation_rules`
**Purpose**: Rules for automatically generating tickets based on system events  
**Migration**: 0020_unified_ticket_system.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rule_name` | TEXT | Rule name (UNIQUE, NOT NULL) |
| `rule_description` | TEXT | Rule description |
| `trigger_event` | TEXT | Trigger event: 'ORDER_DELAYED', 'PAYMENT_FAILED', 'RIDER_NOT_ASSIGNED', etc. (NOT NULL) |
| `trigger_conditions` | JSONB | Conditions that must be met (NOT NULL, default: '{}') |
| `ticket_title` | unified_ticket_title | Ticket title enum (NOT NULL) |
| `ticket_type` | unified_ticket_type | Ticket type enum (NOT NULL) |
| `ticket_category` | unified_ticket_category | Ticket category enum (NOT NULL) |
| `service_type` | unified_ticket_service_type | Service type enum (NOT NULL) |
| `priority` | unified_ticket_priority | Priority enum (NOT NULL, default: 'MEDIUM') |
| `auto_assign` | BOOLEAN | Whether to auto-assign (default: FALSE) |
| `auto_assign_to_agent_id` | INTEGER | Foreign key to `system_users.id` |
| `auto_assign_to_department` | TEXT | Department name for routing |
| `is_active` | BOOLEAN | Whether rule is active (default: TRUE) |
| `is_enabled` | BOOLEAN | Whether rule is enabled (default: TRUE) |
| `metadata` | JSONB | Additional metadata (default: '{}') |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (default: NOW()) |

**Indexes**:
- `ticket_auto_generation_rules_trigger_event_idx` on `trigger_event`
- `ticket_auto_generation_rules_is_active_idx` on `is_active`
- `ticket_auto_generation_rules_is_enabled_idx` on `is_enabled`

---

## 6. Agents Management

**Note**: Agents are managed through the `system_users` table with `primary_role = 'AGENT'`. There is no separate agents table. All agent-related functionality uses the `system_users` table structure described in section 2.1.

**Key Agent Fields in `system_users`**:
- `system_user_id`: Unique agent identifier
- `primary_role`: Set to 'AGENT'
- `status`: Agent status (ACTIVE, SUSPENDED, etc.)
- `suspension_expires_at`: For temporary suspensions (added in 0054)
- `reports_to_id`: Manager assignment
- `department`, `team`: Organizational assignment

**Agent Access Control**:
- Dashboard access via `dashboard_access` table
- Granular permissions via `dashboard_access_points` table
- Ticket access via `ticket_access_controls` table

---

## 7. 3PL Integration

### 7.1 `tpl_providers`
**Purpose**: Registry of 3PL (Third-Party Logistics) providers  
**Migration**: 0049_create_3pl_tables.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `provider_id` | TEXT | Provider identifier (UNIQUE, NOT NULL) |
| `provider_name` | TEXT | Provider name (NOT NULL) |
| `provider_type` | TEXT | Provider type: 'food', 'parcel', 'person_ride', 'multi' (NOT NULL) |
| `integration_type` | TEXT | Integration type: 'inbound', 'outbound', 'bidirectional' (NOT NULL) |
| `api_base_url` | TEXT | API base URL |
| `api_key` | TEXT | API key |
| `api_secret` | TEXT | API secret |
| `webhook_url` | TEXT | Webhook URL |
| `webhook_secret` | TEXT | Webhook secret |
| `status` | TEXT | Status: 'active', 'inactive', 'suspended', 'testing' (NOT NULL, default: 'active') |
| `supported_order_types` | TEXT[] | Array of supported order types (NOT NULL, default: '[]') |
| `commission_rate` | NUMERIC(5, 2) | Commission rate |
| `service_areas` | JSONB | Geographic coverage areas (default: '{}') |
| `capabilities` | JSONB | Provider capabilities (default: '{}') |
| `metadata` | JSONB | Additional metadata (default: '{}') |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (default: NOW()) |

**Indexes**:
- `idx_tpl_providers_status` on `status`
- `idx_tpl_providers_type` on `provider_type`
- `idx_tpl_providers_integration_type` on `integration_type`

---

### 7.2 `tpl_order_requests`
**Purpose**: Outbound orders sent to 3PL providers for fulfillment  
**Migration**: 0049_create_3pl_tables.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `request_id` | TEXT | Request identifier (UNIQUE, NOT NULL) |
| `internal_order_id` | BIGINT | Foreign key to `orders.id` (ON DELETE CASCADE, NOT NULL) |
| `tpl_provider_id` | BIGINT | Foreign key to `tpl_providers.id` (NOT NULL) |
| `order_type` | TEXT | Order type: 'food', 'parcel', 'person_ride' (NOT NULL) |
| `request_status` | TEXT | Request status: 'pending', 'sent', 'accepted', 'rejected', 'cancelled', 'expired' (NOT NULL, default: 'pending') |
| `request_payload` | JSONB | Full order data sent to 3PL (NOT NULL) |
| `tpl_order_id` | TEXT | 3PL's order ID (if accepted) |
| `tpl_reference` | TEXT | 3PL's reference number |
| `rejection_reason` | TEXT | Rejection reason |
| `rejection_code` | TEXT | Rejection code |
| `accepted_at` | TIMESTAMP WITH TIME ZONE | Acceptance timestamp |
| `rejected_at` | TIMESTAMP WITH TIME ZONE | Rejection timestamp |
| `cancelled_at` | TIMESTAMP WITH TIME ZONE | Cancellation timestamp |
| `response_payload` | JSONB | 3PL's response |
| `retry_count` | INTEGER | Retry count (default: 0) |
| `max_retries` | INTEGER | Maximum retries (default: 3) |
| `last_retry_at` | TIMESTAMP WITH TIME ZONE | Last retry timestamp |
| `next_retry_at` | TIMESTAMP WITH TIME ZONE | Next retry timestamp |
| `error_message` | TEXT | Error message |
| `error_code` | TEXT | Error code |
| `http_status_code` | INTEGER | HTTP status code |
| `request_metadata` | JSONB | Request metadata (default: '{}') |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (default: NOW()) |

**Indexes**:
- Multiple indexes for performance on key columns

---

## 8. Rider Domain

This section documents all tables used for rider management, tracking, and operations. These tables are used by the Rider Dashboard to display rider information, online/offline status, recent orders, withdrawals, tickets, and other rider-related data.

### 8.1 `riders`
**Purpose**: Core rider table storing essential rider identity, status, and location information  
**Used By**: `/api/riders/[id]`, `/api/riders/[id]/summary`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key (generated always as identity) |
| `mobile` | TEXT | Mobile number (UNIQUE, NOT NULL) |
| `country_code` | TEXT | Country code (NOT NULL, default: '+91') |
| `name` | TEXT | Rider name |
| `aadhaar_number` | TEXT | Aadhaar card number |
| `pan_number` | TEXT | PAN card number |
| `dob` | DATE | Date of birth |
| `selfie_url` | TEXT | Selfie image URL |
| `onboarding_stage` | onboarding_stage | Onboarding stage enum: 'MOBILE_VERIFIED', 'KYC', 'PAYMENT', 'APPROVAL', 'ACTIVE' (NOT NULL, default: 'MOBILE_VERIFIED') |
| `kyc_status` | kyc_status | KYC status enum: 'PENDING', 'REVIEW', 'APPROVED', 'REJECTED' (NOT NULL, default: 'PENDING') |
| `status` | rider_status | Rider status: 'ACTIVE', 'INACTIVE', 'BLOCKED', 'BANNED' (NOT NULL, default: 'INACTIVE'). Set to **INACTIVE** when permanently blacklisted for all services; set to **ACTIVE** when whitelisted (any or all services) via `POST /api/riders/[id]/blacklist`. |
| `city` | TEXT | City name |
| `state` | TEXT | State name |
| `pincode` | TEXT | Pincode |
| `address` | TEXT | Full address |
| `lat` | DOUBLE PRECISION | Latitude coordinate |
| `lon` | DOUBLE PRECISION | Longitude coordinate |
| `referral_code` | TEXT | Unique referral code |
| `referred_by` | INTEGER | Foreign key to `riders.id` (self-referencing) |
| `default_language` | TEXT | Default language (NOT NULL, default: 'en') |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (NOT NULL, default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (NOT NULL, default: NOW()) |

**Indexes**:
- `riders_mobile_idx` (UNIQUE) on `mobile`
- `riders_referral_code_idx` (UNIQUE) on `referral_code`
- `riders_status_idx` on `status`
- `riders_city_idx` on `city`
- `riders_kyc_status_idx` on `kyc_status`
- `riders_vehicle_choice_idx` on `vehicle_choice` WHERE `vehicle_choice IS NOT NULL` - Added in 0060

**Data Collected For**:
- Basic rider information (name, mobile, ID, city, pincode, state, status, onboarding status)

---

### 8.2 `rider_documents`
**Purpose**: Stores all rider document submissions (Aadhaar, PAN, DL, RC, Selfie, etc.) with verification status  
**Used By**: `/api/riders/[id]` (full details page)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rider_id` | INTEGER | Foreign key to `riders.id` (ON DELETE CASCADE, NOT NULL) |
| `doc_type` | document_type | Document type enum: 'aadhaar', 'pan', 'dl', 'rc', 'selfie', 'rental_proof', 'ev_proof' (NOT NULL) |
| `file_url` | TEXT | Document file URL (NOT NULL) |
| `r2_key` | TEXT | R2 storage key for URL regeneration (NULL for APP_VERIFIED documents) |
| `doc_number` | TEXT | Document identification number (DL number, RC number, etc.) |
| `verification_method` | verification_method | Verification method enum: 'APP_VERIFIED', 'MANUAL_UPLOAD' (NOT NULL, default: 'MANUAL_UPLOAD') |
| `extracted_name` | TEXT | Name extracted from document |
| `extracted_dob` | DATE | Date of birth extracted from document |
| `verified` | BOOLEAN | Whether document is verified (NOT NULL, default: FALSE) |
| `verifier_user_id` | INTEGER | Foreign key to `system_users.id` (who verified) |
| `rejected_reason` | TEXT | Reason for rejection (if rejected) |
| `metadata` | JSONB | Additional metadata (default: '{}') |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (NOT NULL, default: NOW()) |

**Indexes**:
- `rider_documents_rider_id_idx` on `rider_id`
- `rider_documents_doc_type_idx` on `doc_type`
- `rider_documents_verified_idx` on `verified`
- `rider_documents_doc_number_idx` on `doc_number`
- `rider_documents_verification_method_idx` on `verification_method`
- `rider_documents_vehicle_id_idx` on `vehicle_id` WHERE `vehicle_id IS NOT NULL` - Added in 0060

**Data Collected For**:
- All rider documents displayed on the "View Full Details" page

---

### 8.3 `duty_logs`
**Purpose**: Tracks rider ON/OFF duty status changes (immutable log)  
**Used By**: `/api/riders/[id]/summary` (for online/offline status)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rider_id` | INTEGER | Foreign key to `riders.id` (ON DELETE CASCADE, NOT NULL) |
| `status` | duty_status | Duty status enum: 'ON', 'OFF', 'AUTO_OFF' (NOT NULL) |
| `timestamp` | TIMESTAMP WITH TIME ZONE | When status changed (NOT NULL, default: NOW()) |

**Indexes**:
- `duty_logs_rider_id_idx` on `rider_id`
- `duty_logs_timestamp_idx` on `timestamp`
- `duty_logs_rider_status_idx` on (`rider_id`, `status`)
- `duty_logs_rider_timestamp_idx` on (`rider_id`, `timestamp DESC`) - Added in 0060 for efficient duty time calculations

**Data Collected For**:
- **Online/Offline Status**: Determined by checking the most recent `duty_logs` entry where `status = 'ON'` means online, otherwise offline. If no duty log exists, rider is offline (not inactive - that's account status).
- **Duty Hours Calculation**: Use `calculate_rider_duty_hours(rider_id, start_date, end_date)` function to calculate total duty active time for day/week/month.

**Functions**:
- `calculate_rider_duty_hours(p_rider_id INTEGER, p_start_date TIMESTAMP WITH TIME ZONE, p_end_date TIMESTAMP WITH TIME ZONE)`: Calculates total duty hours (time spent with status ON) for a rider in a given time period

**Notes**:
- This is an IMMUTABLE log - never update or delete records
- The most recent entry determines current online/offline status
- **CRITICAL**: Every ON/OFF transition must create a new entry to enable accurate duty time calculations

---

### 8.4 `orders` (Legacy)
**Purpose**: Legacy table storing all orders assigned to riders (food, parcel, person_ride). Coexists with hybrid schema; see [Order Domain (Hybrid)](#9-order-domain-hybrid) for `orders_core` and service-specific tables.  
**Used By**: `/api/riders/[id]/summary` (recent orders section, default), `/api/riders/[id]/orders` (default). Optional `?source=core` uses `orders_core` instead.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `order_type` | order_type | Order type enum: 'food', 'parcel', 'person_ride' (NOT NULL) |
| `external_ref` | TEXT | External reference number |
| `rider_id` | INTEGER | Foreign key to `riders.id` |
| `merchant_id` | INTEGER | Merchant ID |
| `customer_id` | INTEGER | Customer ID |
| `pickup_address` | TEXT | Pickup address (NOT NULL) |
| `drop_address` | TEXT | Drop address (NOT NULL) |
| `pickup_lat` | DOUBLE PRECISION | Pickup latitude (NOT NULL) |
| `pickup_lon` | DOUBLE PRECISION | Pickup longitude (NOT NULL) |
| `drop_lat` | DOUBLE PRECISION | Drop latitude (NOT NULL) |
| `drop_lon` | DOUBLE PRECISION | Drop longitude (NOT NULL) |
| `distance_km` | NUMERIC(10, 2) | Distance in kilometers |
| `eta_seconds` | INTEGER | Estimated time of arrival in seconds |
| `fare_amount` | NUMERIC(10, 2) | Total fare amount |
| `commission_amount` | NUMERIC(10, 2) | Commission amount |
| `rider_earning` | NUMERIC(10, 2) | Rider earning amount |
| `status` | order_status | Order status enum (NOT NULL, default: 'assigned') |
| `metadata` | JSONB | Additional metadata (default: '{}') |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (NOT NULL, default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (NOT NULL, default: NOW()) |

**Indexes**:
- `orders_rider_id_idx` on `rider_id`
- `orders_status_idx` on `status`
- `orders_order_type_idx` on `order_type`
- `orders_created_at_idx` on `created_at`
- `orders_rider_status_idx` on (`rider_id`, `status`)
- `orders_external_ref_idx` on `external_ref`

**Data Collected For**:
- Recent orders displayed in the rider summary page (with filters for count and date range). Use `?source=core` to fetch from `orders_core` (hybrid schema).

---

## 9. Order Domain (Hybrid)

The hybrid order schema (migrations 0067–0069) introduces **orders_core** as the single source of truth per order, with 1:1 service-specific tables (**orders_food**, **orders_parcel**, **orders_ride**), a generic **order_provider_mapping** (replacing provider-specific columns), and supporting tables for OTPs, delivery images, and route snapshots. The legacy **orders** table remains for backward compatibility until cutover. See [ORDER_HYBRID_ARCHITECTURE.md](documentation/orders_domain/ORDER_HYBRID_ARCHITECTURE.md) for full architecture and migration strategy.

### 9.1 `order_providers`
**Purpose**: Registry of order sources (internal, swiggy, zomato, rapido, ondc, shiprocket, other)  
**Migration**: 0067_orders_hybrid_core_and_services.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `code` | TEXT | Provider code (UNIQUE, NOT NULL) |
| `name` | TEXT | Display name (NOT NULL) |
| `is_active` | BOOLEAN | Whether provider is active (NOT NULL, default: TRUE) |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (default: NOW()) |

**Indexes**: `order_providers_code_idx`, `order_providers_is_active_idx`

---

### 9.2 `orders_core`
**Purpose**: Core order table for all types (food, parcel, person_ride). Identity, parties, locations (6-decimal lat/lon), status, payment, risk/bulk, distance mismatch. Join to orders_food/orders_parcel/orders_ride by order_type.  
**Migration**: 0067_orders_hybrid_core_and_services.sql  
**Used By**: `/api/riders/[id]/orders?source=core`, `/api/riders/[id]/summary?source=core` (optional)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `order_uuid` | UUID | Unique order UUID (UNIQUE, NOT NULL, default: gen_random_uuid()) |
| `order_type` | order_type | Order type: 'food', 'parcel', 'person_ride' (NOT NULL) |
| `order_source` | order_source_type | Source: 'internal', 'swiggy', 'zomato', 'rapido', 'ondc', 'shiprocket', 'other' (NOT NULL, default: 'internal') |
| `external_ref` | TEXT | External reference |
| `rider_id` | INTEGER | FK to riders.id (ON DELETE SET NULL) |
| `customer_id` | BIGINT | FK to customers.id (ON DELETE SET NULL) |
| `merchant_store_id` | BIGINT | FK to merchant_stores.id (ON DELETE SET NULL) |
| `merchant_parent_id` | BIGINT | Merchant parent |
| `pickup_address_raw` | TEXT | Pickup address as entered (NOT NULL) |
| `pickup_address_normalized` | TEXT | Normalized pickup address |
| `pickup_address_geocoded` | TEXT | Geocoded pickup address |
| `pickup_lat` | NUMERIC(9, 6) | Pickup latitude, 6 decimal places (NOT NULL) |
| `pickup_lon` | NUMERIC(9, 6) | Pickup longitude, 6 decimal places (NOT NULL) |
| `drop_address_raw` | TEXT | Drop address as entered (NOT NULL) |
| `drop_address_normalized` | TEXT | Normalized drop address |
| `drop_address_geocoded` | TEXT | Geocoded drop address |
| `drop_lat` | NUMERIC(9, 6) | Drop latitude, 6 decimal places (NOT NULL) |
| `drop_lon` | NUMERIC(9, 6) | Drop longitude, 6 decimal places (NOT NULL) |
| `distance_km` | NUMERIC(10, 2) | Total distance (Mapbox or app) |
| `eta_seconds` | INTEGER | ETA in seconds |
| `pickup_address_deviation_meters` | NUMERIC(8, 2) | Pickup address deviation from geocode |
| `drop_address_deviation_meters` | NUMERIC(8, 2) | Drop address deviation from geocode |
| `distance_mismatch_flagged` | BOOLEAN | TRUE when deviation > 700m (NOT NULL, default: FALSE) |
| `fare_amount` | NUMERIC(10, 2) | Fare amount |
| `commission_amount` | NUMERIC(10, 2) | Commission amount |
| `rider_earning` | NUMERIC(10, 2) | Rider earning |
| `status` | order_status_type | Status (NOT NULL, default: 'assigned') |
| `current_status` | TEXT | Denormalized status from timeline |
| `payment_status` | payment_status_type | Payment status |
| `payment_method` | payment_mode_type | Payment method |
| `risk_flagged` | BOOLEAN | Order-level risk flag (NOT NULL, default: FALSE) |
| `risk_reason` | TEXT | Risk reason |
| `is_bulk_order` | BOOLEAN | Bulk order flag (NOT NULL, default: FALSE) |
| `bulk_order_group_id` | TEXT | Bulk group identifier |
| `cancellation_reason_id` | BIGINT | FK to order_cancellation_reasons.id (if exists) |
| `cancelled_at` | TIMESTAMP WITH TIME ZONE | Cancellation timestamp |
| `cancelled_by` | TEXT | Who cancelled |
| `cancelled_by_id` | BIGINT | Who cancelled (ID) |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (NOT NULL, default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (NOT NULL, default: NOW()) |
| `estimated_pickup_time` | TIMESTAMP WITH TIME ZONE | Estimated pickup time |
| `estimated_delivery_time` | TIMESTAMP WITH TIME ZONE | Estimated delivery time |
| `actual_pickup_time` | TIMESTAMP WITH TIME ZONE | Actual pickup time |
| `actual_delivery_time` | TIMESTAMP WITH TIME ZONE | Actual delivery time |

**Indexes**: rider_id, status, order_type, created_at, customer_id, order_source, order_uuid, rider_status, type_status_created, active_rider (partial), risk_flagged (partial), distance_mismatch (partial).

---

### 9.3 `orders_food`
**Purpose**: Food-specific details; 1:1 with orders_core when order_type = 'food'.  
**Migration**: 0067_orders_hybrid_core_and_services.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `order_id` | BIGINT | FK to orders_core.id (UNIQUE, NOT NULL, ON DELETE CASCADE) |
| `merchant_store_id` | BIGINT | FK to merchant_stores.id |
| `merchant_parent_id` | BIGINT | Merchant parent |
| `restaurant_name` | TEXT | Restaurant name |
| `restaurant_phone` | TEXT | Restaurant phone |
| `preparation_time_minutes` | INTEGER | Prep time (minutes) |
| `food_items_count` | INTEGER | Number of food items |
| `food_items_total_value` | NUMERIC(12, 2) | Total food value |
| `requires_utensils` | BOOLEAN | Utensils required (default: FALSE) |
| `is_fragile` | BOOLEAN | Fragile items e.g. ice cream (NOT NULL, default: FALSE) |
| `is_high_value` | BOOLEAN | Order value >= 1200 (NOT NULL, default: FALSE) |
| `veg_non_veg` | veg_non_veg_type | veg, non_veg, mixed, na |
| `delivery_instructions` | TEXT | Delivery instructions |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (default: NOW()) |

**Indexes**: order_id, merchant_store_id (partial).

---

### 9.4 `orders_parcel`
**Purpose**: Parcel-specific details; 1:1 with orders_core when order_type = 'parcel'. No merchant.  
**Migration**: 0067_orders_hybrid_core_and_services.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `order_id` | BIGINT | FK to orders_core.id (UNIQUE, NOT NULL, ON DELETE CASCADE) |
| `weight_kg` | NUMERIC(10, 2) | Weight (kg) |
| `length_cm` | NUMERIC(5, 2) | Length (cm) |
| `width_cm` | NUMERIC(5, 2) | Width (cm) |
| `height_cm` | NUMERIC(5, 2) | Height (cm) |
| `parcel_type` | TEXT | Parcel type |
| `declared_value` | NUMERIC(12, 2) | Declared value |
| `insurance_required` | BOOLEAN | Insurance required (NOT NULL, default: FALSE) |
| `insurance_amount` | NUMERIC(10, 2) | Insurance amount |
| `is_cod` | BOOLEAN | Cash on delivery (default: FALSE) |
| `cod_amount` | NUMERIC(10, 2) | COD amount |
| `requires_signature` | BOOLEAN | Signature required (default: FALSE) |
| `requires_otp_verification` | BOOLEAN | OTP verification (default: FALSE) |
| `instructions` | TEXT | Instructions |
| `scheduled_pickup_time` | TIMESTAMP WITH TIME ZONE | Scheduled pickup time |
| `scheduled_delivery_time` | TIMESTAMP WITH TIME ZONE | Scheduled delivery time |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (default: NOW()) |

**Indexes**: order_id.

---

### 9.5 `orders_ride`
**Purpose**: Person-ride-specific details; 1:1 with orders_core when order_type = 'person_ride'.  
**Migration**: 0067_orders_hybrid_core_and_services.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `order_id` | BIGINT | FK to orders_core.id (UNIQUE, NOT NULL, ON DELETE CASCADE) |
| `passenger_name` | TEXT | Passenger name |
| `passenger_phone` | TEXT | Passenger phone |
| `passenger_count` | INTEGER | Passenger count (default: 1) |
| `ride_type` | TEXT | Ride type |
| `vehicle_type_required` | TEXT | Vehicle type required |
| `waiting_charges` | NUMERIC(10, 2) | Waiting charges (default: 0) |
| `toll_charges` | NUMERIC(10, 2) | Toll charges (default: 0) |
| `parking_charges` | NUMERIC(10, 2) | Parking charges (default: 0) |
| `scheduled_ride` | BOOLEAN | Scheduled ride (default: FALSE) |
| `scheduled_pickup_time` | TIMESTAMP WITH TIME ZONE | Scheduled pickup time |
| `return_trip` | BOOLEAN | Return trip (default: FALSE) |
| `return_pickup_address` | TEXT | Return pickup address |
| `return_pickup_lat` | NUMERIC(9, 6) | Return pickup latitude |
| `return_pickup_lon` | NUMERIC(9, 6) | Return pickup longitude |
| `return_pickup_time` | TIMESTAMP WITH TIME ZONE | Return pickup time |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (default: NOW()) |

**Indexes**: order_id, scheduled (partial).

---

### 9.6 `order_provider_mapping`
**Purpose**: One row per order–provider pair. Replaces swiggy_order_id, zomato_order_id, rapido_*, etc.  
**Migration**: 0067_orders_hybrid_core_and_services.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `order_id` | BIGINT | FK to orders_core.id (NOT NULL, ON DELETE CASCADE) |
| `provider_id` | BIGINT | FK to order_providers.id (NOT NULL, ON DELETE RESTRICT) |
| `provider_order_id` | TEXT | Provider's order ID (NOT NULL) |
| `provider_reference` | TEXT | Provider reference |
| `provider_status` | TEXT | Provider status |
| `provider_status_updated_at` | TIMESTAMP WITH TIME ZONE | When provider status was updated |
| `synced_at` | TIMESTAMP WITH TIME ZONE | Last sync timestamp |
| `sync_status` | TEXT | Sync status |
| `sync_error` | TEXT | Sync error message |
| `provider_metadata` | JSONB | Provider-specific snapshot (default: '{}') |
| `provider_fare` | NUMERIC(12, 2) | Provider fare |
| `provider_commission` | NUMERIC(12, 2) | Provider commission |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (default: NOW()) |

**Constraints**: UNIQUE(provider_id, provider_order_id).  
**Indexes**: order_id, (provider_id, provider_order_id).

---

### 9.7 `order_otps`
**Purpose**: OTP for pickup, delivery, RTO. Pickup OTP can be bypassed if rider uploads image (bypass_reason e.g. image_uploaded).  
**Migration**: 0068_order_otps_delivery_images_route_snapshots.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `order_id` | BIGINT | FK to orders_core.id (NOT NULL, ON DELETE CASCADE) |
| `otp_type` | order_otp_type | 'pickup', 'delivery', 'rto' (NOT NULL) |
| `code` | TEXT | OTP code (NOT NULL) |
| `verified_at` | TIMESTAMP WITH TIME ZONE | When verified |
| `bypass_reason` | TEXT | Reason OTP was bypassed (e.g. image_uploaded) |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (default: NOW()) |

**Constraints**: UNIQUE(order_id, otp_type).  
**Indexes**: order_id, otp_type.

---

### 9.8 `order_delivery_images`
**Purpose**: Rider-uploaded images at pickup, delivery, or RTO. Pickup image can bypass OTP.  
**Migration**: 0068_order_otps_delivery_images_route_snapshots.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `order_id` | BIGINT | FK to orders_core.id (NOT NULL, ON DELETE CASCADE) |
| `rider_assignment_id` | BIGINT | FK to order_rider_assignments.id (optional) |
| `image_type` | TEXT | 'pickup', 'delivery', 'rto' (NOT NULL) |
| `url` | TEXT | Image URL (NOT NULL) |
| `taken_at` | TIMESTAMP WITH TIME ZONE | When taken (NOT NULL, default: NOW()) |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (default: NOW()) |

**Indexes**: order_id, image_type, taken_at.

---

### 9.9 `order_route_snapshots`
**Purpose**: Mapbox (or app) route/distance result. Used for distance_mismatch_flagged on orders_core when deviation > 700m.  
**Migration**: 0068_order_otps_delivery_images_route_snapshots.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `order_id` | BIGINT | FK to orders_core.id (NOT NULL, ON DELETE CASCADE) |
| `snapshot_type` | TEXT | Snapshot type (NOT NULL) |
| `distance_km` | NUMERIC(10, 2) | Distance (km) |
| `duration_seconds` | INTEGER | Duration (seconds) |
| `polyline` | TEXT | Route polyline |
| `mapbox_response` | JSONB | Raw Mapbox response |
| `recorded_at` | TIMESTAMP WITH TIME ZONE | When recorded (NOT NULL, default: NOW()) |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (default: NOW()) |

**Indexes**: order_id, recorded_at.

---

### 9.10 `order_notifications` (order_core_id)
**Purpose**: Existing order_notifications table (0008); migration 0069 adds optional **order_core_id** (FK to orders_core.id) for hybrid migration.  
**Migration**: 0069_order_notifications_orders_core_id.sql

| Column (added) | Type | Description |
|----------------|------|-------------|
| `order_core_id` | BIGINT | FK to orders_core.id (ON DELETE CASCADE); used after cutover for new orders |

**Indexes**: order_notifications_order_core_id_idx (partial, WHERE order_core_id IS NOT NULL).

---

### 8.5 `withdrawal_requests`
**Purpose**: Stores rider withdrawal requests for earnings  
**Used By**: `/api/riders/[id]/summary` (recent withdrawals section)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rider_id` | INTEGER | Foreign key to `riders.id` (ON DELETE CASCADE, NOT NULL) |
| `amount` | NUMERIC(10, 2) | Withdrawal amount (NOT NULL) |
| `status` | withdrawal_status | Status enum: 'pending', 'processing', 'completed', 'failed', 'cancelled' (NOT NULL, default: 'pending') |
| `bank_acc` | TEXT | Bank account number (NOT NULL) |
| `ifsc` | TEXT | IFSC code (NOT NULL) |
| `account_holder_name` | TEXT | Account holder name (NOT NULL) |
| `upi_id` | TEXT | UPI ID (optional) |
| `transaction_id` | TEXT | Transaction ID (if processed) |
| `failure_reason` | TEXT | Failure reason (if failed) |
| `processed_at` | TIMESTAMP WITH TIME ZONE | Processing timestamp |
| `metadata` | JSONB | Additional metadata (default: '{}') |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (NOT NULL, default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (NOT NULL, default: NOW()) |

**Indexes**:
- `withdrawal_requests_rider_id_idx` on `rider_id`
- `withdrawal_requests_status_idx` on `status`
- `withdrawal_requests_created_at_idx` on `created_at`

**Data Collected For**:
- Recent withdrawal logs displayed in the rider summary page (with filters for count and date range)

---

### 8.6 `tickets`
**Purpose**: Support tickets raised by or related to riders  
**Migration**: 0080_tickets_resolved_by.sql (adds `resolved_by`)  
**Used By**: `/api/riders/[id]/summary` (recent tickets section)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rider_id` | INTEGER | Foreign key to `riders.id` (ON DELETE CASCADE, NOT NULL) |
| `order_id` | INTEGER | Foreign key to `orders.id` (optional) |
| `category` | TEXT | Ticket category (NOT NULL) |
| `priority` | TEXT | Priority: 'low', 'medium', 'high', 'urgent' (NOT NULL, default: 'medium') |
| `subject` | TEXT | Ticket subject (NOT NULL) |
| `message` | TEXT | Ticket message (NOT NULL) |
| `status` | ticket_status | Status enum: 'open', 'in_progress', 'resolved', 'closed' (NOT NULL, default: 'open') |
| `assigned_to` | INTEGER | Foreign key to `system_users.id` (assigned agent) |
| `resolved_by` | INTEGER | Foreign key to `system_users.id` – agent who resolved/closed the ticket (0080) |
| `resolution` | TEXT | Resolution text |
| `metadata` | JSONB | Additional metadata (default: '{}') |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (NOT NULL, default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (NOT NULL, default: NOW()) |
| `resolved_at` | TIMESTAMP WITH TIME ZONE | Resolution timestamp |

**Indexes**:
- `tickets_rider_id_idx` on `rider_id`
- `tickets_status_idx` on `status`
- `tickets_category_idx` on `category`
- `tickets_created_at_idx` on `created_at`
- `tickets_resolved_by_idx` on `resolved_by` WHERE `resolved_by IS NOT NULL` (0080)

**Data Collected For**:
- Recent tickets displayed in the rider summary page (with filters for count and date range)

---

### 8.7 `blacklist_history`
**Purpose**: Immutable audit trail of rider blacklist/whitelist actions. Every blacklist and whitelist action is stored as a new row; no updates or deletes.  
**Migration**: 0060_rider_domain_enhancements.sql, 0061_fix_rider_schema_clarifications.sql, 0063_blacklist_source.sql, 0070_blacklist_actor_email.sql  
**Used By**: `/api/riders/[id]/summary` (blacklist status by service), `POST /api/riders/[id]/blacklist` (create action)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rider_id` | INTEGER | Foreign key to `riders.id` (ON DELETE CASCADE, NOT NULL) |
| `service_type` | service_type | Service type enum: 'food', 'parcel', 'person_ride', 'all' (NOT NULL, default: 'all') |
| `reason` | TEXT | Reason for blacklisting/whitelisting (NOT NULL) |
| `banned` | BOOLEAN | TRUE = blacklist, FALSE = whitelist (NOT NULL, default: TRUE) |
| `is_permanent` | BOOLEAN | Whether blacklist is permanent (NOT NULL, default: FALSE) |
| `expires_at` | TIMESTAMP WITH TIME ZONE | Expiration for temporary blacklists (NULL for permanent or whitelist) |
| `admin_user_id` | INTEGER | Foreign key to `system_users.id` (agent who performed action; NULL if source is system/automated) |
| `source` | TEXT | Who performed the action: 'agent', 'system', 'automated' (NOT NULL, default: 'agent') |
| `actor_email` | TEXT | Email of agent who performed the action (when source=agent); stored at insert for reliable display – 0070 |
| `created_at` | TIMESTAMP WITH TIME ZONE | Action timestamp (NOT NULL, default: NOW()) |

**Indexes**:
- `blacklist_history_rider_id_idx` on `rider_id`
- `blacklist_history_banned_idx` on `banned`
- `blacklist_history_service_type_idx` on `service_type`
- `blacklist_history_rider_service_idx` on (`rider_id`, `service_type`)
- `blacklist_history_source_idx` on `source`

**Data Collected For**:
- **Blacklist Status by Service**: Effective status per slot (food, parcel, person_ride, all). For each slot, the most recent relevant entry (considering service_type and 'all') determines current ban status. Expired temporary bans are treated as not banned. Response includes isBanned, reason, isPermanent, expiresAt, source, remainingMs (for temporary active bans).

**Notes**:
- **Full history**: Every blacklist and whitelist action is appended as a new row; never update or delete.
- **Permanent blacklist**: Use `service_type = 'all'`; rider is banned from all services until whitelisted. When applied, **riders.status** is set to **INACTIVE**.
- **Whitelist**: When any whitelist action is performed (any service or all), **riders.status** is set to **ACTIVE**.
- **Temporary blacklist**: Use `service_type` in ('food', 'parcel', 'person_ride'); each service can be blacklisted/whitelisted independently. Requires `expires_at` for temporary.
- **Source**: Distinguishes agent (dashboard), system, or automated actions for audit.

---

### 8.8 `rider_penalties`
**Purpose**: Tracks penalties per service type (food, parcel, person_ride) for each rider; supports add/revert with full agent audit (who imposed, who reverted).  
**Migration**: 0060_rider_domain_enhancements.sql, 0071_rider_penalties_source_reversed_by.sql  
**Used By**: `/api/riders/[id]/summary` (recent penalties), `GET/POST /api/riders/[id]/penalties`, `POST /api/riders/[id]/penalties/[penaltyId]/revert`

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rider_id` | INTEGER | Foreign key to `riders.id` (ON DELETE CASCADE, NOT NULL) |
| `service_type` | order_type | Service type enum: 'food', 'parcel', 'person_ride' (NOT NULL) |
| `penalty_type` | TEXT | Penalty type: 'late_delivery', 'customer_complaint', 'fraud', 'cancellation', 'extra_charges', 'order_mistake', 'other', etc. (NOT NULL) |
| `amount` | NUMERIC(10, 2) | Penalty amount (NOT NULL) |
| `reason` | TEXT | Penalty reason (NOT NULL) |
| `status` | TEXT | Penalty status: 'active', 'reversed', 'paid' (NOT NULL, default: 'active') |
| `order_id` | BIGINT | Foreign key to `orders.id` (ON DELETE SET NULL) |
| `imposed_by` | INTEGER | Foreign key to `system_users.id` (ON DELETE SET NULL) – agent who imposed |
| `source` | TEXT | Who imposed: 'agent' (manual/dashboard), 'system' (automatic) (default: 'agent') – 0071 |
| `imposed_at` | TIMESTAMP WITH TIME ZONE | When penalty was imposed (NOT NULL, default: NOW()) |
| `resolved_at` | TIMESTAMP WITH TIME ZONE | When penalty was resolved |
| `resolution_notes` | TEXT | Resolution notes (e.g. revert reason) |
| `reversed_by` | INTEGER | Foreign key to `system_users.id` (ON DELETE SET NULL) – agent who reverted; set when status = 'reversed' – 0071 |
| `metadata` | JSONB | Additional metadata (default: '{}') |

**Indexes**:
- `rider_penalties_rider_id_idx` on `rider_id`
- `rider_penalties_service_type_idx` on `service_type`
- `rider_penalties_status_idx` on `status`
- `rider_penalties_order_id_idx` on `order_id` WHERE `order_id IS NOT NULL`
- `rider_penalties_imposed_at_idx` on `imposed_at`
- `rider_penalties_rider_service_idx` on (`rider_id`, `service_type`)

**Data Collected For**:
- Recent penalties in rider summary; penalties page shows source (Agent/System), imposed by, reversed by, and resolution notes. Add penalty (manual) and revert penalty are tracked in `action_audit_log` and in `wallet_ledger` via `performed_by_type`/`performed_by_id`.

---

### 8.9 `rider_vehicles`
**Purpose**: Stores vehicle information for riders with enhanced fields for service matching  
**Migration**: 0004_production_enhancements.sql (base), 0060_rider_domain_enhancements.sql (enhancements)  
**Used By**: `/api/riders/[id]/summary` (vehicle information)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rider_id` | INTEGER | Foreign key to `riders.id` (ON DELETE CASCADE, NOT NULL) |
| `vehicle_type` | vehicle_type | Vehicle type enum: 'bike', 'car', 'bicycle', 'scooter', 'auto' (NOT NULL) - Updated to enum in 0061 |
| `registration_number` | TEXT | Official vehicle registration number (RC number) from RTO (NOT NULL). **IMPORTANT**: Use this field consistently - do NOT use "bike_number" or "vehicle_number" in other tables. |
| `make` | TEXT | Vehicle make (e.g., 'Honda', 'Hero') |
| `model` | TEXT | Vehicle model (e.g., 'Activa', 'Splendor') |
| `year` | INTEGER | Manufacturing year |
| `color` | TEXT | Vehicle color |
| `fuel_type` | TEXT | Fuel type: 'EV', 'Petrol', 'Diesel', 'CNG' - Added in 0060 |
| `vehicle_category` | TEXT | Vehicle category: 'Auto', 'Bike', 'Cab', 'Taxi', 'Bicycle', 'Scooter' - Added in 0060 |
| `ac_type` | TEXT | AC type: 'AC', 'Non-AC' (for person_ride service) - Added in 0060 |
| `service_types` | JSONB | Array of service types this vehicle can serve: ['food', 'parcel', 'person_ride'] (default: '[]') - Added in 0060 |
| `insurance_expiry` | DATE | Insurance expiry date |
| `rc_document_url` | TEXT | RC document URL |
| `insurance_document_url` | TEXT | Insurance document URL |
| `verified` | BOOLEAN | Whether vehicle is verified (default: FALSE) |
| `verified_at` | TIMESTAMP WITH TIME ZONE | Verification timestamp |
| `verified_by` | INTEGER | Foreign key to `system_users.id` (admin who verified) |
| `is_active` | BOOLEAN | Whether vehicle is active (default: TRUE) |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (NOT NULL, default: NOW()) |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Update timestamp (NOT NULL, default: NOW()) |

**Indexes**:
- `rider_vehicles_rider_id_idx` on `rider_id`
- `rider_vehicles_vehicle_type_idx` on `vehicle_type`
- `rider_vehicles_registration_number_idx` on `registration_number`
- `rider_vehicles_verified_idx` on `verified`
- `rider_vehicles_is_active_idx` on `is_active`
- `rider_vehicles_fuel_type_idx` on `fuel_type` WHERE `fuel_type IS NOT NULL` - Added in 0060
- `rider_vehicles_vehicle_category_idx` on `vehicle_category` WHERE `vehicle_category IS NOT NULL` - Added in 0060
- `rider_vehicles_service_types_idx` on `service_types` USING GIN - Added in 0060
- `rider_vehicles_rider_active_idx` (UNIQUE) on `rider_id` WHERE `is_active = TRUE` - Ensures one active vehicle per rider

**Data Collected For**:
- Vehicle information displayed in the rider summary page (type, fuel, category, service types)

---

### 8.10 `rider_wallet`
**Purpose**: Unified wallet for riders with total balance and service-specific earnings tracking; supports freeze (block withdrawals) with agent tracking; FIFO unblock allocation for generic credits (0079).  
**Migration**: 0060, 0062 (allow negative balance), 0066 (trigger), 0071 (freeze), 0076/0077 (penalty/penalty_reversal + generic manual_add updated by app only), 0079 (unblock_alloc_*, global block -200).  
**Used By**: Wallet management, earnings tracking, negative-wallet block trigger

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rider_id` | INTEGER | Foreign key to `riders.id` (ON DELETE CASCADE, UNIQUE, NOT NULL) |
| `total_balance` | NUMERIC(10, 2) | Total wallet balance; can be **negative**, zero, or positive (NOT NULL, default: 0) |
| `earnings_food` | NUMERIC(10, 2) | Total earnings from food service (NOT NULL, default: 0) |
| `earnings_parcel` | NUMERIC(10, 2) | Total earnings from parcel service (NOT NULL, default: 0) |
| `earnings_person_ride` | NUMERIC(10, 2) | Total earnings from person_ride service (NOT NULL, default: 0) |
| `penalties_food` | NUMERIC(10, 2) | Total penalties from food service (NOT NULL, default: 0) |
| `penalties_parcel` | NUMERIC(10, 2) | Total penalties from parcel service (NOT NULL, default: 0) |
| `penalties_person_ride` | NUMERIC(10, 2) | Total penalties from person_ride service (NOT NULL, default: 0) |
| `unblock_alloc_food` | NUMERIC(10, 2) | Generic credit allocated to food for FIFO unblock (NOT NULL, default: 0) – 0079 |
| `unblock_alloc_parcel` | NUMERIC(10, 2) | Generic credit allocated to parcel for FIFO unblock (NOT NULL, default: 0) – 0079 |
| `unblock_alloc_person_ride` | NUMERIC(10, 2) | Generic credit allocated to person_ride for FIFO unblock (NOT NULL, default: 0) – 0079 |
| `total_withdrawn` | NUMERIC(10, 2) | Total amount withdrawn (from total balance, not per service) (NOT NULL, default: 0) |
| `is_frozen` | BOOLEAN | When true, rider cannot request or complete withdrawals (NOT NULL, default: FALSE) – 0071 |
| `frozen_at` | TIMESTAMP WITH TIME ZONE | When the wallet was last frozen (NULL if not frozen) – 0071 |
| `frozen_by_system_user_id` | INTEGER | Foreign key to `system_users.id` (ON DELETE SET NULL) – agent who last froze the wallet – 0071 |
| `last_updated_at` | TIMESTAMP WITH TIME ZONE | Last update timestamp (NOT NULL, default: NOW()) |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (NOT NULL, default: NOW()) |

**Indexes**:
- `rider_wallet_rider_id_idx` (UNIQUE) on `rider_id` (via UNIQUE constraint)
- `rider_wallet_total_balance_idx` on `total_balance`
- `rider_wallet_is_frozen_idx` on `is_frozen` WHERE `is_frozen = TRUE` – 0071
- `rider_wallet_frozen_by_idx` on `frozen_by_system_user_id` WHERE `frozen_by_system_user_id IS NOT NULL` – 0071

**Triggers**:
- `wallet_ledger_update_wallet_trigger`: On every `wallet_ledger` INSERT, updates `rider_wallet` for **all entry types except penalty, penalty_reversal, and generic manual_add (no service_type)** (0077, 0079). Those are updated only by the dashboard app. Generic manual_add is applied via POST `/api/riders/[id]/wallet/add-balance` (FIFO allocation + sync).
- `rider_wallet_sync_negative_blocks`: On every `rider_wallet` INSERT or UPDATE, runs `sync_rider_negative_wallet_blocks_from_wallet()` (0073, 0076, 0078, 0079, **0084**). **0084**: No blocks when `total_balance > 0`; only when `total_balance ≤ 0` are per-service (effective_net ≤ -50) and global (total_balance ≤ -200) blocks applied. **Global block**: if `total_balance ≤ -200`, block ALL services (reason `global_emergency`); unlock when `total_balance ≥ 0`. **Service block**: else block service when effective_net = (earnings − penalties + unblock_alloc) ≤ -50.

**Notes**:
- **Unified Wallet**: Total balance = sum of all credits minus all debits; can be negative, zero, or positive.
- **Penalty / Penalty reversal**: Dashboard app updates `rider_wallet` (only the relevant service column and total_balance); the ledger trigger does **not** update wallet for `penalty` or `penalty_reversal` (0077).
- **Generic add balance**: Ledger trigger skips `manual_add` when `service_type` is NULL; app uses POST `/api/riders/[id]/wallet/add-balance` to update total_balance, run FIFO allocation into `unblock_alloc_*`, and sync blocks (0079).
- **FIFO unblock**: When rider adds generic credit, amount is allocated in block order (first blocked → first unblocked) so effective_net per service can exceed -50 and unblock in order.
- **Service-Specific Tracking**: Earnings and penalties are tracked per service (food, parcel, person_ride).
- **Withdrawals**: Riders withdraw from `total_balance`; `total_withdrawn` tracks cumulative withdrawals. When `is_frozen = TRUE`, withdrawals must be blocked.
- **Freeze**: `is_frozen`, `frozen_at`, `frozen_by_system_user_id` track wallet freeze state and who froze it; full history in `rider_wallet_freeze_history` (0071).

---

### 8.10.1 `rider_wallet_freeze_history`
**Purpose**: Audit log of wallet freeze/unfreeze actions with agent tracking.  
**Migration**: 0071_rider_wallet_freeze.sql

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rider_id` | INTEGER | Foreign key to `riders.id` (ON DELETE CASCADE, NOT NULL) |
| `action` | TEXT | 'freeze' or 'unfreeze' (NOT NULL) |
| `performed_by_system_user_id` | INTEGER | Foreign key to `system_users.id` (ON DELETE SET NULL, NOT NULL) |
| `reason` | TEXT | Reason for freeze/unfreeze |
| `created_at` | TIMESTAMP WITH TIME ZONE | Action timestamp (NOT NULL, default: NOW()) |

**Indexes**:
- `rider_wallet_freeze_history_rider_id_idx` on `rider_id`
- `rider_wallet_freeze_history_created_at_idx` on `created_at DESC`
- `rider_wallet_freeze_history_performed_by_idx` on `performed_by_system_user_id`

---

### 8.10.2 `rider_negative_wallet_blocks`
**Purpose**: Temporary blocks: **global** when `total_balance ≤ -200` (all services, reason `global_emergency`); **per-service** when effective_net = (earnings − penalties + unblock_alloc) ≤ -50 (reason `negative_wallet`). Not used for agent blacklist (that is `blacklist_history`).  
**Migration**: 0072 (table), 0073 (trigger), 0076 (repair + trigger), 0078 (threshold -50), 0079 (global block -200, effective_net + allocation), 0084 (no blocks when total_balance > 0).  
**Used By**: `/api/riders/[id]/summary` (negativeWalletBlocks, globalWalletBlock, blockReason), UI “Blocked (negative wallet)” / “All services blocked (wallet ≤ -200)”

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rider_id` | INTEGER | Foreign key to `riders.id` (ON DELETE CASCADE, NOT NULL) |
| `service_type` | TEXT | 'food', 'parcel', or 'person_ride' (NOT NULL) |
| `reason` | TEXT | 'negative_wallet' (per-service) or 'global_emergency' (total_balance ≤ -200) (NOT NULL, default: 'negative_wallet') |
| `created_at` | TIMESTAMP WITH TIME ZONE | When block was created (NOT NULL, default: NOW()) |

**Constraints**:
- UNIQUE(`rider_id`, `service_type`)
- CHECK `service_type` IN ('food', 'parcel', 'person_ride')

**Indexes**:
- `rider_negative_wallet_blocks_rider_id_idx` on `rider_id`
- `rider_negative_wallet_blocks_service_type_idx` on `service_type`
- `rider_negative_wallet_blocks_rider_service_idx` on (`rider_id`, `service_type`)

**Triggers**:
- `rider_wallet_sync_negative_blocks` on `rider_wallet` (AFTER INSERT OR UPDATE) calls `sync_rider_negative_wallet_blocks_from_wallet()`. **Global**: if `total_balance ≤ -200`, delete all blocks for rider and insert three rows (food, parcel, person_ride) with reason `global_emergency`. **Per-service**: else effective_net = (earnings − penalties + unblock_alloc) per service; delete all, then insert only for services where effective_net ≤ -50 (reason `negative_wallet`). Unblock when effective_net > -50 or when total_balance ≥ 0 for global. See **BLOCK_STATUS_SOURCES.md**.

**Notes**:
- **0084**: No blocks are created while `total_balance > 0`. Per-service and global blocks apply only when `total_balance ≤ 0`.
- **Global block**: total_balance ≤ -200 → all services blocked; unlock when total_balance ≥ 0 (0079).
- **Service threshold**: Block only when effective_net ≤ **-50** (0078, 0079). -49 or higher = no block. effective_net includes `unblock_alloc_*` for FIFO.
- **Single source of blocks**: Only this table drives “negative wallet” blocks. Agent blacklist is separate (`blacklist_history` / `blacklist_current_status`).
- **Replace semantics**: Trigger replaces all blocks for the rider on every wallet update; no incremental add/remove.

---

### 8.11 `wallet_ledger` (Enhanced)
**Purpose**: Immutable transaction log for rider wallet; every credit/debit is recorded with optional actor tracking  
**Migration**: Base table in 0002, enhanced in 0060 (service_type), 0066 (extended entry types, performed_by_type, performed_by_id)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key (part of composite key) |
| `rider_id` | INTEGER | Foreign key to `riders.id` (ON DELETE CASCADE, NOT NULL) |
| `entry_type` | wallet_entry_type | Entry type (NOT NULL). See **Entry types** below. |
| `amount` | NUMERIC(10, 2) | Transaction amount, stored as positive (NOT NULL) |
| `balance` | NUMERIC(10, 2) | Running balance after this entry (can be negative) |
| `service_type` | TEXT | 'food', 'parcel', 'person_ride', or NULL for non-service-specific |
| `ref` | TEXT | Reference ID (order_id, withdrawal_id, penalty_id, etc.) |
| `ref_type` | TEXT | Reference type: 'order', 'withdrawal', 'penalty', 'penalty_revert', etc. |
| `description` | TEXT | Human-readable description |
| `metadata` | JSONB | Additional data (default: '{}') |
| `performed_by_type` | TEXT | Who performed: 'agent', 'system', 'rider', 'automated' (default: 'system') – 0066 |
| `performed_by_id` | INTEGER | FK to `system_users.id` when performed_by_type = 'agent' (for audit) – 0066 |
| `created_at` | TIMESTAMP WITH TIME ZONE | Transaction timestamp (NOT NULL, default: NOW()) |

**Entry types (wallet_entry_type)**  
- **Credits** (add to total_balance): `earning`, `refund`, `bonus`, `referral_bonus`, `incentive`, `surge`, `failed_withdrawal_revert`, `penalty_reversal`, `cancellation_payout`, `manual_add`. `adjustment` when amount ≥ 0.  
- **Debits** (subtract from total_balance): `penalty`, `onboarding_fee`, `withdrawal`, `subscription_fee`, `purchase`, `cod_order`, `manual_deduct`, `other`. `adjustment` when amount < 0.  
- **Semantics**: `earning` = order delivery (food/parcel/person_ride); `cancellation_payout` = first mile or full delivery when order cancelled not rider fault; `withdrawal` = payout to rider; `penalty_reversal` = agent/system reverts penalty; `manual_add`/`manual_deduct` = agent adjust balance; `failed_withdrawal_revert` = failed withdrawal amount back to wallet.

**Indexes**:
- `wallet_ledger_rider_id_idx`, `wallet_ledger_entry_type_idx`, `wallet_ledger_created_at_idx`, `wallet_ledger_rider_created_idx`, `wallet_ledger_ref_idx`, `wallet_ledger_service_type_idx`, `wallet_ledger_rider_service_idx`
- `wallet_ledger_performed_by_type_idx`, `wallet_ledger_performed_by_id_idx` (0066)

**Notes**:
- **Service-Specific Tracking**: `service_type` used for earning/penalty to update rider_wallet per-service fields.
- **Actor Tracking**: Use `performed_by_type` and `performed_by_id` to audit agent manual actions (e.g. penalty add/reversal, manual add/deduct).
- **Trigger (0077)**: The ledger trigger **skips** `penalty` and `penalty_reversal`; the dashboard app updates `rider_wallet` for those so only the chosen service is updated and negative-wallet blocks stay correct. All other entry types are still updated by the trigger.
- **Partitioned table**: If `wallet_ledger` is partitioned (e.g. by HASH rider_id), the trigger must be on the **parent** table only (0075, 0076); do not create/drop the trigger on partitions.

---

### 8.12 Additional Rider-Related Tables (Not Currently Used in Summary API)

#### 8.12.1 `rider_devices`
**Purpose**: Tracks rider devices for security and fraud prevention

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `rider_id` | INTEGER | Foreign key to `riders.id` (ON DELETE CASCADE, NOT NULL) |
| `device_id` | TEXT | Device identifier (NOT NULL) |
| `ip_address` | TEXT | IP address |
| `sim_id` | TEXT | SIM card ID |
| `model` | TEXT | Device model |
| `os_version` | TEXT | OS version |
| `fcm_token` | TEXT | FCM push notification token |
| `allowed` | BOOLEAN | Whether device is allowed (NOT NULL, default: TRUE) |
| `last_seen` | TIMESTAMP WITH TIME ZONE | Last seen timestamp (NOT NULL, default: NOW()) |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp (NOT NULL, default: NOW()) |

#### 8.12.2 `rider_location_events`
**Purpose**: Rider location events for fraud detection and location tracking

#### 8.12.3 `location_logs`
**Purpose**: High-volume time-series location data (recommended: partition by month)

#### 8.12.4 `wallet_ledger`
**Purpose**: Wallet transaction ledger for riders (partitioned by rider_id) - Enhanced with service_type in 0060

#### 8.12.5 `onboarding_payments`
**Purpose**: Onboarding payments (registration fees, etc.)

#### 8.12.6 `offers` & `offer_participation`
**Purpose**: Offers and rider participation in offers

#### 8.12.7 `ratings`
**Purpose**: Ratings given to/from riders

#### 8.12.8 `referrals`
**Purpose**: Referral tracking (referrer and referred riders)

#### 8.12.9 `rider_daily_analytics`
**Purpose**: Daily aggregated analytics for riders

#### 8.12.10 `fraud_logs`
**Purpose**: Fraud detection logs for riders

---

## Summary

### Table Count by Category

1. **Dashboard Access Control**: 2 tables
   - `dashboard_access`
   - `dashboard_access_points`

2. **Authentication & User Management**: 4 tables
   - `system_users`
   - `system_user_auth`
   - `system_user_sessions`
   - `system_user_login_history`

3. **Audit & Compliance**: 3 tables
   - `action_audit_log`
   - `system_audit_logs`
   - `access_activity_logs`

4. **Service Points**: 1 table
   - `service_points`

5. **Ticket System**: 6 tables
   - `unified_tickets`
   - `unified_ticket_messages`
   - `unified_ticket_activities`
   - `ticket_access_controls`
   - `ticket_title_config`
   - `ticket_auto_generation_rules`

6. **Agents Management**: Uses `system_users` table

7. **3PL Integration**: 2+ tables (partial list)
   - `tpl_providers`
   - `tpl_order_requests`

8. **Rider Domain**: 11+ core tables (documented in detail)
   - `riders` - Core rider information (enhanced with vehicle_choice, preferred_service_types)
   - `rider_documents` - Rider documents and verification (enhanced with vehicle_id)
   - `duty_logs` - Online/offline status tracking (enhanced for duty hours calculation)
   - `orders` - Legacy rider orders (coexists with orders_core)
   - `withdrawal_requests` - Withdrawal requests
   - `tickets` - Rider support tickets
   - `blacklist_history` - Blacklist/whitelist status (enhanced with service-specific support, actor_email in 0070)
   - `rider_penalties` - Service-specific penalties with source/reversed_by audit (0060, 0071)
   - `rider_vehicles` - Vehicle information (enhanced with fuel_type, vehicle_category, ac_type, service_types)
   - `rider_wallet` - Unified wallet with service-specific earnings and freeze (0060, 0071)
   - `rider_wallet_freeze_history` - Audit log of wallet freeze/unfreeze (0071)
   - `wallet_ledger` - Wallet transaction ledger (enhanced with service_type, performed_by)
   - Additional tables: `rider_devices`, `location_logs`, `onboarding_payments`, `offers`, `offer_participation`, `ratings`, `referrals`, `rider_daily_analytics`, `fraud_logs`

9. **Order Domain (Hybrid)**: 9+ tables (migrations 0067–0069)
   - `order_providers` - Registry of order sources (internal, swiggy, zomato, rapido, ondc, shiprocket, other)
   - `orders_core` - Core order table (identity, parties, locations 6-decimal, status, payment, risk, distance mismatch)
   - `orders_food` - Food-specific details (1:1 with orders_core when order_type = food)
   - `orders_parcel` - Parcel-specific details (1:1 with orders_core when order_type = parcel)
   - `orders_ride` - Person-ride-specific details (1:1 with orders_core when order_type = person_ride)
   - `order_provider_mapping` - One row per order–provider pair (replaces provider-specific columns)
   - `order_otps` - OTP for pickup/delivery/RTO (bypass_reason e.g. image_uploaded)
   - `order_delivery_images` - Rider images at pickup/delivery/RTO
   - `order_route_snapshots` - Mapbox route/distance result for distance_mismatch_flagged
   - `order_notifications.order_core_id` - Optional FK to orders_core (0069)

**Total Core Tables Documented**: 35+ tables

---

## Key Relationships

1. **Dashboard Access Flow**:
   - `system_users` → `dashboard_access` → `dashboard_access_points`
   - `system_users` → `ticket_access_controls`

2. **Ticket Flow**:
   - `unified_tickets` → `unified_ticket_messages` (conversation)
   - `unified_tickets` → `unified_ticket_activities` (audit trail)
   - `system_users` → `ticket_access_controls` (agent permissions)

3. **Audit Flow**:
   - `system_users` → `action_audit_log` (agent actions)
   - `system_users` → `system_audit_logs` (system-wide audit)
   - `system_users` → `access_activity_logs` (UI/API access)

4. **Rider Data Flow**:
   - `riders` → `rider_documents` (documents)
   - `riders` → `rider_vehicles` (vehicle information)
   - `riders` → `rider_wallet` (wallet balance, service-specific earnings, freeze state)
   - `riders` → `rider_wallet_freeze_history` (freeze/unfreeze audit log)
   - `riders` → `rider_negative_wallet_blocks` (temporary service blocks when per-service net ≤ -50; synced by trigger on rider_wallet)
   - `riders` → `duty_logs` (online/offline status - most recent entry, duty hours calculation)
   - `riders` → `orders` (recent orders, legacy) or `riders` → `orders_core` (recent orders when ?source=core)
   - `riders` → `withdrawal_requests` (recent withdrawals)
   - `riders` → `tickets` (recent tickets)
   - `riders` → `blacklist_history` (blacklist status - service-specific, most recent entry per service)
   - `riders` → `rider_penalties` (service-specific penalties; imposed_by/reversed_by → system_users)
   - `riders` → `wallet_ledger` (wallet transactions with service_type, performed_by)

5. **Order Domain (Hybrid) Flow**:
   - `orders_core` → `orders_food` | `orders_parcel` | `orders_ride` (1:1 by order_type)
   - `orders_core` → `order_provider_mapping` (many); `order_provider_mapping` → `order_providers`
   - `orders_core` → `order_otps`, `order_delivery_images`, `order_route_snapshots` (many)
   - `riders` → `orders_core` (rider_id)

---

## Migration History Reference

- **0042**: Dashboard access control system
- **0043**: Add subrole to users
- **0044**: Extend role enum
- **0045**: Create service points
- **0046**: Update order type enum
- **0047**: Add order type to access
- **0048**: Migrate order dashboard access
- **0049**: Create 3PL tables
- **0050**: Add order type to tickets
- **0051**: Migrate customer ticket dashboard access
- **0052**: Consolidate dashboard access
- **0053**: Add service-based access control
- **0054**: Add suspension expiry
- **0057**: Add doc_number to rider_documents
- **0058**: Add verification_method to rider_documents
- **0059**: Test data for rider onboarding
- **0060**: Rider domain enhancements (service-specific blacklist, penalties, vehicles, wallet, duty tracking)
- **0061**: Fix rider schema clarifications (enums, enhanced duty_logs with service tracking, penalties vs wallet clarification, vehicle number standardization)
- **0062**: Allow negative rider wallet balance
- **0063**: Blacklist source column (agent/system/automated) for audit
- **0066**: Wallet/ledger extended entry types (withdrawal, subscription_fee, purchase, cod_order, incentive, surge, failed_withdrawal_revert, penalty_reversal, cancellation_payout, manual_add, manual_deduct, other) and actor tracking (performed_by_type, performed_by_id); trigger updates rider_wallet for all entry types
- **0067**: Order domain hybrid – order_providers, orders_core, orders_food, orders_parcel, orders_ride, order_provider_mapping; enums order_source_type, payment_status_type, payment_mode_type, veg_non_veg_type; 6-decimal lat/lon, address raw/normalized/geocoded, distance_mismatch_flagged
- **0068**: order_otps, order_delivery_images, order_route_snapshots; order_otp_type enum
- **0069**: order_notifications.order_core_id (optional FK to orders_core)
- **0070**: blacklist_history.actor_email (agent email at insert for reliable display)
- **0071 (rider_penalties)**: rider_penalties.source (agent/system), rider_penalties.reversed_by (FK to system_users)
- **0071 (rider_wallet)**: rider_wallet.is_frozen, frozen_at, frozen_by_system_user_id; rider_wallet_freeze_history table
- **0072**: rider_negative_wallet_blocks table (temporary block per service when net balance too low)
- **0073**: sync_rider_negative_wallet_blocks_from_wallet() trigger on rider_wallet (AFTER INSERT OR UPDATE)
- **0074**: wallet_ledger trigger – service-specific refund/penalty_reversal/earning and rider_wallet updates
- **0075**: wallet_ledger trigger attached to parent table only (for partitioned wallet_ledger)
- **0076**: negative wallet blocks fix and repair – re-apply ledger and block triggers; one-time block repair for affected riders
- **0077**: ledger trigger skips penalty and penalty_reversal (dashboard app updates rider_wallet for those)
- **0078**: negative wallet block threshold set to ≤ -50 (block only when per-service net ≤ -50)
- **0079**: rider_wallet unblock_alloc_food/parcel/person_ride (FIFO); global block when total_balance ≤ -200 (reason global_emergency); sync uses effective_net = (earnings − penalties + unblock_alloc); ledger trigger skips generic manual_add (app add-balance API + FIFO)
- **0080**: tickets.resolved_by (FK to system_users.id) for "resolved by whom" audit; index tickets_resolved_by_idx
- **0081**: wallet_credit_requests table (agent-initiated credits; pending/approved/rejected; approver workflow)
- **0082**: Rider schema redesign – reference tables (cities, service_types, vehicle_service_mapping, city_vehicle_rules), rider_addresses, rider_document_files, rider_payment_methods, riders soft delete/audit columns, rider_documents new columns, withdrawal_requests.payment_method_id
- **0083**: Rider schema full upgrade (idempotent) – enums, reference tables, riders/rider_addresses/rider_documents/rider_document_files/rider_vehicles/rider_payment_methods, withdrawal_requests.payment_method_id, duty_logs.vehicle_id
- **0084**: sync_rider_negative_wallet_blocks_from_wallet() – block only when total_balance ≤ 0 (no blocks while wallet is positive); repair for riders with positive balance but existing blocks
- **0085**: Rider onboarding system redesign – vehicle_type extend (taxi, e_rickshaw, ev_car), rider_documents (fraud_flags, duplicate_document_id, requires_manual_review, verification_method), rider_vehicles (ownership_type, limitation_flags, is_commercial), rider_service_activation, onboarding_status_transitions, onboarding_rule_policies, vehicle_service_mapping seed
- **0086**: Rider domain dummy data (realistic seed; idempotent)
- **0020**: Unified ticket system
- **0016**: Access management complete
- **0017**: Access controls and audit

---

## Notes

1. **Service-Based Access**: Migration 0053 introduced service-specific access points using `order_type` column for RIDER, TICKET, and CUSTOMER dashboards.

2. **Consolidated Dashboards**: Migration 0052 consolidated separate dashboards (CUSTOMER_FOOD, CUSTOMER_PARCEL, etc.) into unified CUSTOMER and TICKET dashboards.

3. **Temporary Suspensions**: Migration 0054 added `suspension_expires_at` to support temporary suspensions with automatic reactivation.

4. **Enterprise Ticket System**: Backend migration 0055-0056 introduces an enterprise-grade ticket system (not fully documented here, but referenced).

5. **Agents**: Agents are managed through `system_users` table with role 'AGENT', not a separate table.

6. **Rider Domain Enhancements (0060, 0061)**:
   - **Service-Specific Blacklist**: Riders can be blacklisted for specific services (food, parcel, person_ride) or all services. Permanent blacklist uses `service_type = 'all'`; temporary blacklist uses per-service type with `expires_at`. Every blacklist/whitelist action is stored (append-only). Column `source` (0063) indicates agent, system, or automated.
   - **Unified Wallet**: `rider_wallet` table tracks aggregated totals per service. Individual transactions in `wallet_ledger`, individual penalty records in `rider_penalties`. Withdrawals are from total balance, not per service.
   - **Duty Hours Tracking**: `duty_logs` must be created for every ON/OFF transition with `service_types` array indicating which services rider is online for. Use `calculate_rider_duty_hours_by_service()` function to calculate total duty time per service.
   - **Service-Specific Online Status**: `duty_logs.service_types` array tracks which services (food, parcel, person_ride) rider is available for when online. Use `duty_current_status` view for current status per service.
   - **Penalties Tracking**: `rider_penalties` table tracks individual penalty records per service type. Dashboard app updates `rider_wallet` for penalty and penalty_reversal (per-service only); ledger trigger skips those (0077).
   - **Negative-Wallet Blocks**: `rider_negative_wallet_blocks` table stores temporary blocks: global (total_balance ≤ -200, reason global_emergency) or per-service when effective_net ≤ -50. Synced by trigger on `rider_wallet`. FIFO unblock via `unblock_alloc_*`. See **BLOCK_STATUS_SOURCES.md** and migrations 0078, 0079.
   - **Rider Status**: When permanently blacklisted for all services, `riders.status` is set to INACTIVE; when whitelisted (any or all services), set to ACTIVE.
   - **Vehicle Information**: `rider_vehicles` enhanced with fuel_type, vehicle_category, ac_type, and service_types. Use `registration_number` consistently (official RC number).
   - **Enums for Type Safety**: All status fields, service types, vehicle types, fuel types, etc. now use proper enums for data integrity (0061).

---

**Document Version**: 1.8  
**Last Updated**: February 8, 2026  
**Maintained By**: Development Team

**Changelog (v1.8)**:
- **Last Updated**: February 8, 2026. **Migration scope**: 0042 through 0086 (dashboard), 0055-0056 (backend).
- **0080**: Documented `tickets.resolved_by` (FK to system_users) and index; used for "resolved by whom" audit.
- **0084**: Documented `sync_rider_negative_wallet_blocks_from_wallet()` change – no blocks when total_balance > 0; blocks only when total_balance ≤ 0.
- **Migration History Reference**: Added 0080, 0081, 0082, 0083, 0084, 0085, 0086.
- **Continued documentation**: New tables and detailed changes for 0080–0086 and Enterprise Ticket System are in **DASHBOARD_TABLES_DOCUMENTATION_PART2.md**.

**Changelog (v1.7)**:
- **Migration 0079**: rider_wallet unblock_alloc_food/parcel/person_ride for FIFO unblock; global block when total_balance ≤ -200 (reason global_emergency); sync uses effective_net; ledger trigger skips generic manual_add; POST /api/riders/[id]/wallet/add-balance for generic add + FIFO.
- **rider_wallet (8.10)**: Documented unblock_alloc_* columns, global block, FIFO, and ledger skip for generic manual_add.
- **8.10.2 rider_negative_wallet_blocks**: Documented global_emergency reason, global block -200, effective_net with allocation; summary API globalWalletBlock and blockReason.
- **Migration history**: Added 0079.

**Changelog (v1.6)**:
- **Rider status**: Documented that `riders.status` is set to INACTIVE when permanently blacklisted for all services, ACTIVE when whitelisted (any or all) via blacklist API.
- **blacklist_history (8.7)**: Added notes on rider status updates (INACTIVE on permanent blacklist all, ACTIVE on whitelist).
- **rider_wallet (8.10)**: Documented `rider_wallet_sync_negative_blocks` trigger; penalty/penalty_reversal updated by dashboard app only (0077); ledger trigger skips those.
- **8.10.2 rider_negative_wallet_blocks**: New section for temporary negative-wallet blocks table (0072, 0073, 0076, 0078); threshold -50; replace semantics.
- **wallet_ledger (8.11)**: Documented trigger skip for penalty/penalty_reversal (0077) and partitioned-table note (0075/0076).
- **Migration history**: Added 0072–0078 (negative-wallet blocks, ledger/block triggers, threshold -50).
- **Rider domain summary**: Added negative-wallet blocks and rider status behavior.

**Changelog (v1.5)**:
- **Migration 0070**: Documented `blacklist_history.actor_email` (agent email at insert for reliable display).
- **Migration 0071 (rider_penalties)**: Documented `rider_penalties.source` (agent/system) and `rider_penalties.reversed_by` (FK to system_users); updated 8.8 with API usage and audit notes.
- **Migration 0071 (rider_wallet)**: Documented `rider_wallet.is_frozen`, `frozen_at`, `frozen_by_system_user_id`; added **8.10.1** `rider_wallet_freeze_history` table.
- Fixed markdown table formatting (double-pipe to single-pipe) in rider_penalties (8.8), rider_vehicles (8.9), rider_wallet (8.10), wallet_ledger (8.11).
- Updated Migration History Reference and Summary table count to include 0070, 0071.

---

## Rider Dashboard Data Collection Summary

### API Endpoints and Tables Used

#### `/api/riders/[id]/summary` - Rider Summary Data
This endpoint collects data from the following tables:

1. **Basic Rider Info** → `riders` table
   - Fields: id, name, mobile, countryCode, city, state, pincode, status, onboardingStage, kycStatus, vehicleChoice, preferredServiceTypes

2. **Vehicle Information** → `rider_vehicles` table
   - Query: Active vehicle where `rider_id = ?` and `is_active = TRUE`
   - Fields: id, vehicleType, registrationNumber, make, model, fuelType, vehicleCategory, acType, serviceTypes, verified
   - Returns: Vehicle details or null if no active vehicle

3. **Online/Offline Status** → `duty_logs` table
   - Query: Most recent entry where `rider_id = ?` ordered by `timestamp DESC`
   - Status: `status = 'ON'` means online, otherwise offline (if no entry exists, rider is offline)
   - Returns: `isOnline` (boolean), `lastDutyStatus`, `lastDutyTimestamp`
   - **Note**: Every ON/OFF transition must create a new entry for accurate duty hours calculation

4. **Recent Orders** → `orders` table (default) or `orders_core` table (when `?source=core`)
   - Query: Filtered by `rider_id` with optional date range filters
   - Fields: id, orderType, status, fareAmount, riderEarning, createdAt (legacy shape when source=core)
   - Supports: Count limit (5, 10, 20, 50) and date range filters
   - **Order Metrics**: Calculated per service type (food, parcel, person_ride) - sent, accepted, completed, rejected counts
   - **Hybrid**: Use query param `source=core` to fetch from `orders_core` (compat shape returned)

5. **Recent Withdrawals** → `withdrawal_requests` table
   - Query: Filtered by `rider_id` with optional date range filters
   - Fields: id, amount, status, bankAcc, createdAt, processedAt
   - Supports: Count limit and date range filters

6. **Recent Tickets** → `tickets` table
   - Query: Filtered by `rider_id` with optional date range filters
   - Fields: id, category, priority, subject, status, createdAt, resolvedAt
   - Supports: Count limit and date range filters

7. **Recent Penalties** → `rider_penalties` table
   - Query: Filtered by `rider_id` ordered by `imposed_at DESC`
   - Fields: id, serviceType, penaltyType, amount, reason, status, imposedAt, resolvedAt
   - Supports: Service-specific penalty tracking

8. **Blacklist Status** → `blacklist_history` table
   - Query: All entries where `rider_id = ?` ordered by `created_at DESC`. Effective status per slot: for "all" use most recent `service_type = 'all'`; for food/parcel/person_ride use most recent among that service or 'all'. Entry is "active" only if `banned = TRUE` and (is_permanent or expires_at is null or expires_at > now()).
   - Fields: isBanned, reason, isPermanent, expiresAt, createdAt, source, remainingMs (for temporary active bans)
   - Returns: Service-specific blacklist status (food, parcel, person_ride, all). Full history is retained; current status is derived from most recent active/whitelist entry per slot.
   - **API**: `POST /api/riders/[id]/blacklist` creates a new row (action: blacklist or whitelist; reason required; source 'agent' from dashboard).

#### `/api/riders/[id]` - Full Rider Details
This endpoint collects data from:

1. **Rider Information** → `riders` table
   - All rider fields including personal information, status, location, etc.

2. **Rider Documents** → `rider_documents` table
   - All documents for the rider with verification status
   - Includes: docType, fileUrl, verificationMethod, verified status, verifier info, etc.

### Key Notes

- **Online/Offline Status Per Service**: Determined by checking the most recent `duty_logs` entry where `status = 'ON'` and `service_types` array contains the service. Use `duty_current_status` view for current status per service. If rider is not in the view for a service, they are offline for that service.
- **Duty Hours Calculation**: Use `calculate_rider_duty_hours_by_service(rider_id, service_type, start_date, end_date)` function to calculate total duty active time per service for day/week/month. Pass NULL for service_type to calculate for all services combined. Requires every ON/OFF transition to be logged with `service_types` array.
- **Service-Specific Online Tracking**: When rider goes online, `duty_logs.service_types` array must contain at least one service type (food, parcel, person_ride). This allows tracking which services rider is available for. The `session_id` field tracks complete duty cycles (ON -> OFF).
- **Blacklist Status**: Service-specific blacklist status (food, parcel, person_ride, all). Every action is stored in `blacklist_history`; current status is derived from the most recent entry per slot (considering service_type and 'all'). Expired temporary bans are not active. Response includes source and remainingMs for temporary bans. Use `blacklist_current_status` view for current active blacklist per service.
- **Penalties vs Wallet Relationship**: 
  - `rider_penalties` table = Individual penalty records with details (reason, imposed_by, etc.)
  - `rider_wallet` table = Aggregated totals per service (penalties_food, penalties_parcel, etc.)
  - When a penalty in `rider_penalties` is paid (status=paid), it is deducted from `rider_wallet.total_balance` and the service-specific penalty field
  - Individual penalty transactions are also recorded in `wallet_ledger`
- **Wallet Management**: `rider_wallet` table tracks aggregated totals per service; **total_balance** can be negative, zero, or positive. Individual transactions are in `wallet_ledger` with full **entry_type** set (credits: earning, refund, bonus, incentive, surge, failed_withdrawal_revert, penalty_reversal, cancellation_payout, manual_add; debits: penalty, withdrawal, subscription_fee, purchase, cod_order, manual_deduct, other). Use **performed_by_type** and **performed_by_id** to audit agent manual actions. Auto-updated via trigger on every `wallet_ledger` insert.
- **Vehicle Number Naming**: Use `registration_number` field consistently in `rider_vehicles` table. This is the official RC number from RTO. Do NOT use "bike_number" or "vehicle_number" in other tables - always reference `rider_vehicles.registration_number`.
- **Enums for Type Safety**: All status fields, service types, vehicle types, fuel types, etc. now use proper enums (penalty_status, service_type, vehicle_type, fuel_type, vehicle_category, ac_type, penalty_type) for data integrity and type safety.
- **Service-Specific Tracking**: Earnings, penalties, blacklist status, and duty logs are tracked per service (food, parcel, person_ride) while maintaining unified totals in wallet.
- **Date Filters**: All recent data sections (orders, withdrawals, tickets, penalties) support date range filtering via `fromDate` and `toDate` query parameters.
- **Count Limits**: All recent data sections support configurable count limits (5, 10, 20, 50) via query parameters.
