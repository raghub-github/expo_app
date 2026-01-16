# Dashboard Control Tables - Complete Reference (Updated from Actual Schema)

## Overview
This document lists all tables that need to be controlled/managed from the dashboard control page, extracted from the actual `schema.sql` file. These tables cover access management, device control, analytics, page controls, and system configuration.

**Total Tables**: 47+ tables across 6 categories

---

## 📋 **1. ACCESS MANAGEMENT TABLES** (36 tables)

### **1.1 User Management** (6 tables)

#### **1. `system_users`** - System Users (Agents, Admins)
**Purpose**: Core user accounts for dashboard access
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (TEXT, UNIQUE) - Unique identifier
- `full_name` (TEXT, NOT NULL)
- `first_name`, `last_name` (TEXT)
- `email` (TEXT, UNIQUE, NOT NULL) - Email validation regex
- `mobile` (TEXT, NOT NULL) - Phone validation regex
- `alternate_mobile` (TEXT)
- `primary_role` (USER-DEFINED, NOT NULL) - ENUM: SUPER_ADMIN, ADMIN, AGENT, etc.
- `role_display_name` (TEXT)
- `department`, `team` (TEXT)
- `reports_to_id` (BIGINT, FK → system_users.id)
- `manager_name` (TEXT)
- `status` (USER-DEFINED, NOT NULL, DEFAULT 'PENDING_ACTIVATION') - ENUM: ACTIVE, SUSPENDED, DISABLED, PENDING_ACTIVATION, LOCKED
- `status_reason` (TEXT)
- `is_email_verified`, `is_mobile_verified`, `two_factor_enabled` (BOOLEAN, DEFAULT false)
- `last_login_at`, `last_activity_at` (TIMESTAMP)
- `login_count`, `failed_login_attempts` (INTEGER, DEFAULT 0)
- `account_locked_until` (TIMESTAMP)
- `created_by` (BIGINT, FK → system_users.id)
- `created_by_name` (TEXT)
- `approved_by` (BIGINT, FK → system_users.id)
- `approved_at` (TIMESTAMP)
- `deleted_at`, `deleted_by` (TIMESTAMP, BIGINT)
- `created_at`, `updated_at` (TIMESTAMP)

#### **2. `system_user_auth`** - Authentication Data
**Purpose**: Password, 2FA, OTP, security questions
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, UNIQUE, NOT NULL)
- `password_hash` (TEXT, NOT NULL)
- `password_salt` (TEXT)
- `password_last_changed_at` (TIMESTAMP, DEFAULT now())
- `password_expires_at` (TIMESTAMP)
- `two_factor_secret` (TEXT)
- `two_factor_backup_codes` (ARRAY)
- `last_otp`, `last_otp_sent_at` (TEXT, TIMESTAMP)
- `otp_attempts` (INTEGER, DEFAULT 0)
- `security_questions` (JSONB, DEFAULT '[]')
- `recovery_email`, `recovery_mobile` (TEXT)
- `created_at`, `updated_at` (TIMESTAMP)

#### **3. `system_user_sessions`** - Active Sessions
**Purpose**: Track active user sessions, device info, IP, location
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, NOT NULL)
- `session_token` (TEXT, UNIQUE, NOT NULL)
- `refresh_token` (TEXT)
- `device_id`, `device_type` (TEXT)
- `ip_address` (TEXT, NOT NULL)
- `user_agent` (TEXT)
- `location_city`, `location_country` (TEXT)
- `is_active` (BOOLEAN, DEFAULT true)
- `created_at`, `expires_at` (TIMESTAMP, NOT NULL)
- `last_activity_at` (TIMESTAMP, NOT NULL, DEFAULT now())
- `logged_out_at` (TIMESTAMP)

#### **4. `system_user_login_history`** - Login History
**Purpose**: Track all login attempts, success/failure, device, location
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, NOT NULL)
- `session_id` (BIGINT, FK → system_user_sessions.id)
- `login_method` (TEXT, NOT NULL)
- `login_success` (BOOLEAN, NOT NULL)
- `device_id`, `device_type` (TEXT)
- `ip_address`, `user_agent` (TEXT)
- `location_city`, `location_country` (TEXT)
- `failure_reason`, `failure_code` (TEXT)
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **5. `system_user_api_keys`** - API Keys
**Purpose**: API keys, permissions, rate limits
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, NOT NULL)
- `api_key` (TEXT, UNIQUE, NOT NULL)
- `api_key_hash` (TEXT, NOT NULL)
- `api_key_name` (TEXT, NOT NULL)
- `api_key_description` (TEXT)
- `allowed_modules`, `allowed_actions` (ARRAY)
- `rate_limit_per_minute` (INTEGER, DEFAULT 60)
- `rate_limit_per_hour` (INTEGER, DEFAULT 1000)
- `is_active` (BOOLEAN, DEFAULT true)
- `expires_at`, `last_used_at` (TIMESTAMP)
- `usage_count` (INTEGER, DEFAULT 0)
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())
- `created_by` (BIGINT, FK → system_users.id)

#### **6. `system_user_ip_whitelist`** - IP Whitelist
**Purpose**: Allowed IP addresses/ranges for users
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, NOT NULL)
- `ip_address` (TEXT, NOT NULL)
- `ip_range` (TEXT)
- `ip_label`, `ip_description` (TEXT)
- `is_active` (BOOLEAN, DEFAULT true)
- `added_by` (BIGINT, FK → system_users.id)
- `added_at`, `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

---

### **1.2 Roles & Permissions** (5 tables)

#### **7. `system_roles`** - Roles
**Purpose**: Role definitions, hierarchy, permissions
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `role_id` (TEXT, UNIQUE, NOT NULL)
- `role_name` (TEXT, UNIQUE, NOT NULL)
- `role_display_name` (TEXT, NOT NULL)
- `role_description` (TEXT)
- `role_type` (USER-DEFINED, NOT NULL)
- `role_level` (INTEGER, NOT NULL, CHECK > 0)
- `parent_role_id` (BIGINT, FK → system_roles.id)
- `is_system_role`, `is_custom_role` (BOOLEAN, DEFAULT false)
- `is_active` (BOOLEAN, DEFAULT true)
- `created_by`, `updated_by` (BIGINT, FK → system_users.id)
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **8. `system_permissions`** - Permissions
**Purpose**: Permission definitions
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `permission_id` (TEXT, UNIQUE, NOT NULL)
- `permission_name` (TEXT, UNIQUE, NOT NULL)
- `permission_display_name` (TEXT, NOT NULL)
- `permission_description` (TEXT)
- `module_name` (USER-DEFINED, NOT NULL) - ENUM: ORDERS, TICKETS, RIDERS, MERCHANTS, CUSTOMERS, PAYMENTS, REFUNDS, PAYOUTS, OFFERS, ADVERTISEMENTS, ANALYTICS, AUDIT, SETTINGS, USERS
- `action` (USER-DEFINED, NOT NULL) - ENUM: VIEW, CREATE, UPDATE, DELETE, APPROVE, REJECT, ASSIGN, CANCEL, REFUND, BLOCK, UNBLOCK, EXPORT, IMPORT
- `resource_type` (TEXT)
- `risk_level` (TEXT, DEFAULT 'LOW')
- `requires_approval`, `requires_mfa` (BOOLEAN, DEFAULT false)
- `is_active` (BOOLEAN, DEFAULT true)
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **9. `role_permissions`** - Role-Permission Mapping
**Purpose**: Maps roles to permissions
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `role_id` (BIGINT, FK → system_roles.id, NOT NULL)
- `permission_id` (BIGINT, FK → system_permissions.id, NOT NULL)
- `service_scope` (ARRAY)
- `geo_scope` (ARRAY)
- `conditions` (JSONB, DEFAULT '{}')
- `is_active` (BOOLEAN, DEFAULT true)
- `granted_by` (BIGINT, FK → system_users.id)
- `granted_at` (TIMESTAMP, NOT NULL, DEFAULT now())
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **10. `user_roles`** - User-Role Mapping
**Purpose**: Maps users to roles
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, NOT NULL)
- `role_id` (BIGINT, FK → system_roles.id, NOT NULL)
- `is_primary` (BOOLEAN, DEFAULT false)
- `valid_from` (TIMESTAMP, DEFAULT now())
- `valid_until` (TIMESTAMP)
- `is_active` (BOOLEAN, DEFAULT true)
- `assigned_by` (BIGINT, FK → system_users.id, NOT NULL)
- `assigned_by_name` (TEXT)
- `assigned_at` (TIMESTAMP, NOT NULL, DEFAULT now())
- `revoked_at`, `revoked_by`, `revoke_reason` (TIMESTAMP, BIGINT, TEXT)
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **11. `user_permission_overrides`** - Permission Overrides
**Purpose**: User-specific permission overrides
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, NOT NULL)
- `permission_id` (BIGINT, FK → system_permissions.id, NOT NULL)
- `override_type` (TEXT, NOT NULL)
- `is_allowed` (BOOLEAN, NOT NULL)
- `override_reason` (TEXT, NOT NULL)
- `service_scope`, `geo_scope` (ARRAY)
- `valid_from` (TIMESTAMP, DEFAULT now())
- `valid_until` (TIMESTAMP)
- `is_active` (BOOLEAN, DEFAULT true)
- `granted_by` (BIGINT, FK → system_users.id, NOT NULL)
- `granted_by_name`, `granted_at` (TEXT, TIMESTAMP, NOT NULL, DEFAULT now())
- `revoked_at`, `revoked_by` (TIMESTAMP, BIGINT)
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

---

### **1.3 Access Control** (5 tables)

#### **12. `access_modules`** - Access Modules
**Purpose**: Module definitions
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `module_id` (TEXT, UNIQUE, NOT NULL)
- `module_name` (TEXT, UNIQUE, NOT NULL)
- `module_display_name` (TEXT, NOT NULL)
- `module_description` (TEXT)
- `module_type` (USER-DEFINED, NOT NULL)
- `parent_module_id` (BIGINT, FK → access_modules.id)
- `display_order` (INTEGER, DEFAULT 0)
- `module_icon` (TEXT)
- `is_active` (BOOLEAN, DEFAULT true)
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **13. `access_pages`** - Access Pages
**Purpose**: Page definitions within modules
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `page_id` (TEXT, UNIQUE, NOT NULL)
- `module_id` (BIGINT, FK → access_modules.id, NOT NULL)
- `page_name` (TEXT, NOT NULL)
- `page_display_name` (TEXT, NOT NULL)
- `page_description` (TEXT)
- `route_path` (TEXT, UNIQUE, NOT NULL)
- `required_permissions` (ARRAY)
- `is_active` (BOOLEAN, DEFAULT true)
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **14. `access_ui_components`** - UI Components
**Purpose**: Component-level access control
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `component_id` (TEXT, UNIQUE, NOT NULL)
- `page_id` (BIGINT, FK → access_pages.id)
- `component_name` (TEXT, NOT NULL)
- `component_type` (TEXT)
- `required_permission_id` (BIGINT, FK → system_permissions.id)
- `is_active` (BOOLEAN, DEFAULT true)
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **15. `access_api_endpoints`** - API Endpoints
**Purpose**: Endpoint-level access control
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `endpoint_id` (TEXT, UNIQUE, NOT NULL)
- `endpoint_path` (TEXT, NOT NULL)
- `http_method` (TEXT, NOT NULL)
- `endpoint_description` (TEXT)
- `module_name` (USER-DEFINED, NOT NULL)
- `required_permissions` (ARRAY)
- `rate_limit_per_minute` (INTEGER, DEFAULT 60)
- `rate_limit_per_hour` (INTEGER, DEFAULT 1000)
- `is_active` (BOOLEAN, DEFAULT true)
- `is_public` (BOOLEAN, DEFAULT false)
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **16. `access_feature_flags`** - Feature Flags
**Purpose**: Feature flag definitions
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `feature_id` (TEXT, UNIQUE, NOT NULL)
- `feature_name` (TEXT, UNIQUE, NOT NULL)
- `feature_description` (TEXT)
- `is_enabled` (BOOLEAN, DEFAULT false)
- `rollout_percentage` (INTEGER, DEFAULT 0)
- `enabled_for_roles`, `enabled_for_users` (ARRAY)
- `environment` (TEXT, DEFAULT 'production')
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

---

### **1.4 Area & Scope Assignments** (3 tables)

#### **17. `area_assignments`** - Geographic Access
**Purpose**: Area assignments, cities, postal codes, geo boundaries
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, NOT NULL)
- `area_type` (USER-DEFINED, NOT NULL) - ENUM: CITY, ZONE, REGION, STATE, COUNTRY
- `area_code`, `area_name` (TEXT, NOT NULL)
- `service_type` (USER-DEFINED)
- `cities`, `postal_codes` (ARRAY)
- `geo_boundary` (JSONB)
- `is_active` (BOOLEAN, DEFAULT true)
- `valid_from` (TIMESTAMP, DEFAULT now())
- `valid_until` (TIMESTAMP)
- `assigned_by` (BIGINT, FK → system_users.id)
- `assigned_at`, `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **18. `service_scope_assignments`** - Service Access
**Purpose**: Service type access levels
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, NOT NULL)
- `service_type` (USER-DEFINED, NOT NULL)
- `access_level` (USER-DEFINED, NOT NULL, DEFAULT 'READ') - ENUM: NONE, READ, READ_WRITE, FULL, ADMIN
- `is_active` (BOOLEAN, DEFAULT true)
- `assigned_by` (BIGINT, FK → system_users.id)
- `assigned_at`, `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **19. `entity_scope_assignments`** - Entity-Specific Access
**Purpose**: Specific entity (merchant/rider/customer/order) access
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, NOT NULL)
- `entity_type` (TEXT, NOT NULL) - MERCHANT, RIDER, CUSTOMER, ORDER
- `entity_id` (BIGINT, NOT NULL)
- `access_level` (USER-DEFINED, NOT NULL, DEFAULT 'READ') - ENUM: NONE, READ, READ_WRITE, FULL, ADMIN
- `assignment_reason` (TEXT)
- `is_active` (BOOLEAN, DEFAULT true)
- `valid_from` (TIMESTAMP, DEFAULT now())
- `valid_until` (TIMESTAMP)
- `assigned_by` (BIGINT, FK → system_users.id)
- `assigned_at`, `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

---

### **1.5 Domain-Specific Access Controls** (10 tables)

#### **20. `order_access_controls`** - Order Access
**Purpose**: View/action/financial permissions for orders
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, UNIQUE, NOT NULL)
- `can_view_all_orders`, `can_view_assigned_orders`, `can_view_order_financial` (BOOLEAN, DEFAULT false/true)
- `can_view_customer_details`, `can_view_merchant_details`, `can_view_rider_details` (BOOLEAN, DEFAULT false)
- `can_create_order`, `can_update_order`, `can_cancel_order` (BOOLEAN, DEFAULT false)
- `can_assign_rider`, `can_reassign_rider`, `can_override_status`, `can_add_remark` (BOOLEAN, DEFAULT false)
- `can_process_refund`, `can_approve_refund`, `can_adjust_fare` (BOOLEAN, DEFAULT false)
- `refund_approval_limit`, `fare_adjustment_limit` (NUMERIC, DEFAULT 0)
- `food_access`, `parcel_access`, `ride_access` (BOOLEAN, DEFAULT true)
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **21. `ticket_access_controls`** - Ticket Access
**Purpose**: Ticket type/action/priority permissions
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, UNIQUE, NOT NULL)
- `customer_ticket_access`, `rider_ticket_access`, `merchant_ticket_access` (BOOLEAN, DEFAULT true/false)
- `can_view_tickets`, `can_create_ticket`, `can_update_ticket` (BOOLEAN, DEFAULT true/false)
- `can_assign_ticket`, `can_close_ticket`, `can_escalate_ticket` (BOOLEAN, DEFAULT false)
- `can_view_internal_notes` (BOOLEAN, DEFAULT false)
- `can_handle_critical`, `can_handle_urgent`, `can_handle_high` (BOOLEAN, DEFAULT false/true)
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **22. `rider_management_access`** - Rider Management Access
**Purpose**: View/onboarding/document permissions
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, UNIQUE, NOT NULL)
- `can_view_all_riders`, `can_view_assigned_riders`, `can_view_rider_financial`, `can_view_rider_documents` (BOOLEAN, DEFAULT false/true)
- `can_update_onboarding`, `can_approve_documents`, `can_reject_documents` (BOOLEAN, DEFAULT false)
- `can_approve_rider`, `can_reject_rider` (BOOLEAN, DEFAULT false)
- `can_activate_rider`, `can_deactivate_rider`, `can_block_rider`, `can_unblock_rider` (BOOLEAN, DEFAULT false)
- `can_add_penalty`, `can_revert_penalty`, `can_adjust_wallet` (BOOLEAN, DEFAULT false)
- `can_approve_withdrawal`, `can_close_wallet`, `can_update_payment_info` (BOOLEAN, DEFAULT false)
- `can_assign_to_area`, `can_remove_from_area` (BOOLEAN, DEFAULT false)
- `penalty_approval_limit`, `wallet_adjustment_limit`, `withdrawal_approval_limit` (NUMERIC, DEFAULT 0)
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **23. `merchant_management_access`** - Merchant Management Access
**Purpose**: View/onboarding/document permissions
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, UNIQUE, NOT NULL)
- `can_view_all_merchants`, `can_view_assigned_merchants`, `can_view_financial`, `can_view_documents` (BOOLEAN, DEFAULT false/true)
- `can_update_onboarding`, `can_approve_documents`, `can_reject_documents` (BOOLEAN, DEFAULT false)
- `can_approve_store`, `can_reject_store` (BOOLEAN, DEFAULT false)
- `can_update_store_details`, `can_update_store_timing`, `can_update_store_availability` (BOOLEAN, DEFAULT false)
- `can_delist_store`, `can_relist_store`, `can_block_store`, `can_unblock_store` (BOOLEAN, DEFAULT false)
- `can_view_menu`, `can_update_menu`, `can_update_pricing` (BOOLEAN, DEFAULT true/false)
- `can_update_customizations`, `can_update_offers` (BOOLEAN, DEFAULT false)
- `can_update_bank_details`, `can_approve_payout`, `can_adjust_commission` (BOOLEAN, DEFAULT false)
- `can_manage_store_orders` (BOOLEAN, DEFAULT false)
- `payout_approval_limit` (NUMERIC, DEFAULT 0)
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **24. `customer_management_access`** - Customer Management Access
**Purpose**: View/action permissions
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, UNIQUE, NOT NULL)
- `can_view_customer_profile`, `can_view_customer_orders`, `can_view_customer_financial`, `can_view_customer_pii` (BOOLEAN, DEFAULT true/false)
- `can_update_customer_details`, `can_update_customer_addresses`, `can_update_payment_methods` (BOOLEAN, DEFAULT false)
- `can_block_customer`, `can_unblock_customer`, `can_block_device` (BOOLEAN, DEFAULT false)
- `can_reset_password`, `can_process_refund`, `can_adjust_wallet` (BOOLEAN, DEFAULT false)
- `can_issue_coupon` (BOOLEAN, DEFAULT false)
- `can_view_tickets`, `can_respond_to_tickets` (BOOLEAN, DEFAULT true)
- `refund_approval_limit`, `wallet_adjustment_limit` (NUMERIC, DEFAULT 0)
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **25. `payment_access_controls`** - Payment Access
**Purpose**: Payment view/action permissions
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, UNIQUE, NOT NULL)
- `can_view_all_payments`, `can_view_payment_details`, `can_view_gateway_response` (BOOLEAN, DEFAULT false)
- `can_process_refund`, `can_approve_refund`, `can_cancel_payment`, `can_retry_payment` (BOOLEAN, DEFAULT false)
- `refund_approval_limit`, `daily_refund_limit` (NUMERIC, DEFAULT 0)
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **26. `payout_access_controls`** - Payout Access
**Purpose**: Payout view/action permissions
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, UNIQUE, NOT NULL)
- `can_view_all_payouts`, `can_view_payout_details`, `can_view_bank_details` (BOOLEAN, DEFAULT false)
- `can_process_merchant_payout`, `can_process_rider_payout` (BOOLEAN, DEFAULT false)
- `can_approve_payout`, `can_reject_payout`, `can_hold_payout` (BOOLEAN, DEFAULT false)
- `merchant_payout_approval_limit`, `rider_payout_approval_limit`, `daily_payout_limit` (NUMERIC, DEFAULT 0)
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **27. `refund_access_controls`** - Refund Access
**Purpose**: Refund view/action/approval permissions
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, UNIQUE, NOT NULL)
- `can_process_full_refund`, `can_process_partial_refund`, `can_process_item_refund` (BOOLEAN, DEFAULT false)
- `can_approve_customer_refund`, `can_approve_merchant_refund`, `can_approve_rider_refund` (BOOLEAN, DEFAULT false)
- `full_refund_approval_limit`, `partial_refund_approval_limit`, `daily_refund_approval_limit` (NUMERIC, DEFAULT 0)
- `can_auto_approve_under_limit` (BOOLEAN, DEFAULT false)
- `auto_approval_limit` (NUMERIC, DEFAULT 0)
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **28. `offer_management_access`** - Offer Management Access
**Purpose**: Offer view/action permissions
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, UNIQUE, NOT NULL)
- `customer_offer_access`, `merchant_offer_access`, `rider_offer_access` (BOOLEAN, DEFAULT false)
- `can_create_offer`, `can_update_offer`, `can_activate_offer`, `can_deactivate_offer`, `can_delete_offer` (BOOLEAN, DEFAULT false)
- `requires_approval` (BOOLEAN, DEFAULT true)
- `can_approve_offer` (BOOLEAN, DEFAULT false)
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **29. `advertisement_management_access`** - Advertisement Access
**Purpose**: Ad view/action permissions
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, UNIQUE, NOT NULL)
- `can_create_banner_ad`, `can_create_popup_ad`, `can_create_listing_ad` (BOOLEAN, DEFAULT false)
- `customer_app_access`, `merchant_app_access`, `rider_app_access` (BOOLEAN, DEFAULT false)
- `can_update_ad`, `can_activate_ad`, `can_deactivate_ad` (BOOLEAN, DEFAULT false)
- `can_view_ad_analytics` (BOOLEAN, DEFAULT false)
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

---

### **1.6 Audit & Security** (9 tables)

#### **30. `system_audit_logs`** - System Audit Logs
**Purpose**: Comprehensive audit trail
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id)
- `system_user_name`, `role_at_time` (TEXT)
- `module_name` (USER-DEFINED, NOT NULL)
- `action_type`, `action_description` (TEXT, NOT NULL)
- `entity_type`, `entity_id` (TEXT, NOT NULL)
- `old_data`, `new_data` (JSONB)
- `changed_fields` (ARRAY)
- `ip_address`, `device_info`, `user_agent` (TEXT)
- `session_id` (BIGINT, FK → system_user_sessions.id)
- `location_city`, `location_country` (TEXT)
- `request_id`, `api_endpoint`, `http_method` (TEXT)
- `audit_metadata` (JSONB, DEFAULT '{}')
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **31. `access_activity_logs`** - Access Activity Logs
**Purpose**: Access-related activities
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, NOT NULL)
- `access_type` (TEXT, NOT NULL)
- `page_name`, `api_endpoint`, `http_method` (TEXT)
- `action_performed`, `action_result` (TEXT)
- `ip_address`, `device_info` (TEXT)
- `session_id` (BIGINT, FK → system_user_sessions.id)
- `response_time_ms` (INTEGER)
- `request_params`, `response_data` (JSONB, DEFAULT '{}')
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **32. `permission_change_logs`** - Permission Change Logs
**Purpose**: Permission change history
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `target_user_id` (BIGINT, FK → system_users.id, NOT NULL)
- `target_user_name` (TEXT)
- `change_type` (TEXT, NOT NULL)
- `role_id` (BIGINT, FK → system_roles.id)
- `role_name` (TEXT)
- `permission_id` (BIGINT, FK → system_permissions.id)
- `permission_name` (TEXT)
- `changed_by` (BIGINT, FK → system_users.id, NOT NULL)
- `changed_by_name`, `change_reason` (TEXT)
- `access_before`, `access_after` (JSONB)
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **33. `security_events`** - Security Events
**Purpose**: Security incidents, breaches, suspicious activities
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `event_type` (TEXT, NOT NULL)
- `event_severity` (TEXT, NOT NULL, DEFAULT 'MEDIUM')
- `event_description` (TEXT, NOT NULL)
- `system_user_id` (BIGINT, FK → system_users.id)
- `system_user_name` (TEXT)
- `ip_address`, `device_info`, `user_agent` (TEXT)
- `target_resource`, `attempted_action` (TEXT)
- `detected_by` (TEXT)
- `action_taken`, `action_taken_by`, `action_taken_at` (TEXT, BIGINT, TIMESTAMP)
- `is_resolved`, `resolved_at`, `resolution_notes` (BOOLEAN, TIMESTAMP, TEXT)
- `event_metadata` (JSONB, DEFAULT '{}')
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **34. `compliance_audit_trail`** - Compliance Audit
**Purpose**: Compliance-related audit trail
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `compliance_type`, `compliance_category` (TEXT, NOT NULL)
- `system_user_id` (BIGINT, FK → system_users.id)
- `system_user_name`, `role_at_time` (TEXT)
- `action_performed` (TEXT, NOT NULL)
- `action_justification` (TEXT)
- `affected_entities` (JSONB, DEFAULT '[]')
- `affected_customer_count` (INTEGER, DEFAULT 0)
- `data_accessed`, `data_exported`, `data_modified`, `data_deleted` (BOOLEAN, DEFAULT false)
- `approval_required` (BOOLEAN, DEFAULT false)
- `approved_by` (BIGINT, FK → system_users.id)
- `approved_at` (TIMESTAMP)
- `compliance_metadata` (JSONB, DEFAULT '{}')
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **35. `access_delegation`** - Access Delegation
**Purpose**: Temporary access delegation
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `delegator_user_id` (BIGINT, FK → system_users.id, NOT NULL)
- `delegator_name` (TEXT)
- `delegate_user_id` (BIGINT, FK → system_users.id, NOT NULL)
- `delegate_name` (TEXT)
- `delegated_permissions`, `delegated_roles` (ARRAY)
- `delegation_reason` (TEXT, NOT NULL)
- `valid_from` (TIMESTAMP, NOT NULL, DEFAULT now())
- `valid_until` (TIMESTAMP, NOT NULL)
- `is_active` (BOOLEAN, DEFAULT true)
- `is_revoked` (BOOLEAN, DEFAULT false)
- `revoked_at`, `revoked_by`, `revoke_reason` (TIMESTAMP, BIGINT, TEXT)
- `approved_by` (BIGINT, FK → system_users.id)
- `approved_at` (TIMESTAMP)
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **36. `access_approval_workflows`** - Approval Workflows
**Purpose**: Workflow definitions
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `workflow_id` (TEXT, UNIQUE, NOT NULL)
- `workflow_name` (TEXT, NOT NULL)
- `workflow_description` (TEXT)
- `trigger_action` (TEXT, NOT NULL)
- `trigger_module` (USER-DEFINED, NOT NULL)
- `approval_chain` (JSONB, NOT NULL)
- `requires_all_approvals` (BOOLEAN, DEFAULT false)
- `conditions` (JSONB, DEFAULT '{}')
- `approval_timeout_hours` (INTEGER, DEFAULT 24)
- `is_active` (BOOLEAN, DEFAULT true)
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **37. `access_approval_requests`** - Approval Requests
**Purpose**: Access approval requests
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `workflow_id` (BIGINT, FK → access_approval_workflows.id, NOT NULL)
- `requester_user_id` (BIGINT, FK → system_users.id, NOT NULL)
- `requester_name` (TEXT)
- `request_type`, `request_reason` (TEXT, NOT NULL)
- `request_data` (JSONB, DEFAULT '{}')
- `entity_type`, `entity_id` (TEXT, NOT NULL)
- `pending_approvers`, `approved_by` (ARRAY)
- `rejected_by` (BIGINT)
- `approval_status` (TEXT, DEFAULT 'PENDING')
- `final_decision`, `decision_notes` (TEXT)
- `decided_at`, `expires_at` (TIMESTAMP)
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **38. `access_restrictions`** - Access Restrictions
**Purpose**: Time-based, IP-based restrictions
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, NOT NULL)
- `restriction_type` (TEXT, NOT NULL)
- `allowed_days` (ARRAY)
- `allowed_time_start`, `allowed_time_end` (TIME)
- `timezone` (TEXT, DEFAULT 'UTC')
- `allowed_ips`, `blocked_ips` (ARRAY)
- `allowed_countries`, `allowed_cities`, `allowed_device_types` (ARRAY)
- `is_active` (BOOLEAN, DEFAULT true)
- `created_by` (BIGINT, FK → system_users.id)
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **39. `access_emergency_mode`** - Emergency Mode
**Purpose**: Emergency access mode settings
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id, NOT NULL)
- `system_user_name` (TEXT)
- `emergency_reason`, `emergency_type` (TEXT, NOT NULL)
- `elevated_permissions` (ARRAY)
- `approved_by` (BIGINT, FK → system_users.id)
- `approved_at` (TIMESTAMP)
- `activated_at` (TIMESTAMP, NOT NULL, DEFAULT now())
- `expires_at` (TIMESTAMP, NOT NULL)
- `is_active` (BOOLEAN, DEFAULT true)
- `is_revoked` (BOOLEAN, DEFAULT false)
- `revoked_at`, `revoked_by` (TIMESTAMP, BIGINT)
- `actions_performed` (JSONB, DEFAULT '[]')
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

---

## 📱 **2. DEVICE MANAGEMENT TABLES** (3 tables)

#### **40. `rider_devices`** - Rider Devices
**Purpose**: Track devices used by riders
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_id` (INTEGER, FK → riders.id, NOT NULL)
- `device_id` (TEXT, NOT NULL)
- `ip_address`, `sim_id` (TEXT)
- `model`, `os_version` (TEXT)
- `fcm_token` (TEXT) - Push notification token
- `allowed` (BOOLEAN, NOT NULL, DEFAULT true) - Can be blocked for security
- `last_seen` (TIMESTAMP, NOT NULL, DEFAULT now())
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **41. `customer_devices`** - Customer Devices
**Purpose**: Track devices used by customers
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id, NOT NULL)
- `device_id` (TEXT, NOT NULL)
- `device_fingerprint` (TEXT)
- `device_type` (USER-DEFINED, NOT NULL) - ENUM: android, ios, web
- `device_os`, `device_os_version` (TEXT)
- `device_model`, `device_brand` (TEXT)
- `app_version`, `app_build_number` (TEXT)
- `ip_address`, `ip_location` (TEXT)
- `network_type` (TEXT) - WIFI, 4G, 5G
- `fcm_token`, `apns_token` (TEXT) - Push notification tokens
- `push_enabled` (BOOLEAN, DEFAULT true)
- `is_primary`, `is_trusted`, `is_active` (BOOLEAN, DEFAULT false/false/true)
- `first_seen_at`, `last_active_at` (TIMESTAMP, NOT NULL, DEFAULT now())
- `last_ip` (TEXT)
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

**Note**: There is no `system_user_devices` table in the actual schema. System user device tracking is handled via `system_user_sessions`.

---

## 📊 **3. ANALYTICS TABLES** (5 tables)

#### **42. `rider_daily_analytics`** - Rider Daily Analytics
**Purpose**: Pre-aggregated daily metrics for riders
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rider_id` (INTEGER, FK → riders.id, NOT NULL)
- `date` (DATE, NOT NULL)
- `total_orders` (INTEGER, NOT NULL, DEFAULT 0)
- `completed`, `cancelled` (INTEGER, NOT NULL, DEFAULT 0)
- `acceptance_rate` (NUMERIC)
- `earnings_total`, `penalties_total` (NUMERIC, NOT NULL, DEFAULT 0)
- `duty_hours` (NUMERIC)
- `avg_rating` (NUMERIC)
- `metadata` (JSONB, DEFAULT '{}')
- `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **43. `customer_daily_analytics`** - Customer Daily Analytics
**Purpose**: Pre-aggregated daily metrics for customers
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id, NOT NULL)
- `analytics_date` (DATE, NOT NULL)
- `total_orders`, `completed_orders`, `cancelled_orders` (INTEGER, DEFAULT 0)
- `food_orders`, `parcel_orders`, `ride_orders` (INTEGER, DEFAULT 0)
- `total_spent`, `total_saved`, `tips_given` (NUMERIC, DEFAULT 0.0)
- `avg_rating_given` (NUMERIC)
- `ratings_count` (INTEGER, DEFAULT 0)
- `app_opens`, `time_spent_minutes` (INTEGER, DEFAULT 0)
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **44. `merchant_store_daily_analytics`** - Merchant Store Daily Analytics
**Purpose**: Pre-aggregated daily metrics for merchant stores
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `store_id` (BIGINT, NOT NULL)
- `analytics_date` (DATE, NOT NULL)
- `total_orders`, `completed_orders`, `cancelled_orders` (INTEGER, DEFAULT 0)
- `gross_revenue`, `net_revenue`, `total_commission`, `total_tax`, `total_discounts` (NUMERIC, DEFAULT 0)
- `avg_preparation_time_minutes`, `avg_delivery_time_minutes` (INTEGER)
- `avg_rating` (NUMERIC)
- `food_orders`, `parcel_orders`, `ride_orders` (INTEGER, DEFAULT 0)
- `analytics_metadata` (JSONB, DEFAULT '{}')
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **45. `customer_service_analytics`** - Customer Service Analytics
**Purpose**: Service-specific analytics for customers
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id, NOT NULL)
- `service_type` (USER-DEFINED, NOT NULL)
- `total_orders`, `completed_orders`, `cancelled_orders` (INTEGER, DEFAULT 0)
- `cancellation_rate` (NUMERIC, DEFAULT 0.0)
- `total_spent`, `average_order_value` (NUMERIC, DEFAULT 0.0)
- `first_order_at`, `last_order_at` (TIMESTAMP)
- `avg_days_between_orders` (NUMERIC)
- `avg_rating_given`, `ratings_given_count` (NUMERIC, INTEGER, DEFAULT 0)
- `favorite_merchant_ids` (ARRAY)
- `last_updated_at`, `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **46. `provider_order_analytics`** - Provider Order Analytics
**Purpose**: Analytics for external provider orders
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `order_id` (BIGINT, FK → orders.id, NOT NULL)
- `provider_type` (USER-DEFINED, NOT NULL)
- `time_to_assign_seconds`, `time_to_accept_seconds`, `time_to_pickup_seconds`, `time_to_delivery_seconds`, `total_duration_seconds` (INTEGER)
- `estimated_distance_km`, `actual_distance_km`, `distance_variance` (NUMERIC)
- `provider_commission_rate`, `rider_earning_rate`, `platform_margin` (NUMERIC)
- `customer_rating`, `rider_rating` (NUMERIC)
- `cancellation_reason` (TEXT)
- `provider_estimated_time_minutes`, `actual_time_minutes`, `time_variance_minutes` (INTEGER)
- `analytics_metadata` (JSONB, DEFAULT '{}')
- `calculated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

**Note**: There is no `system_analytics` or `dashboard_usage_analytics` table in the actual schema. These would need to be created if needed.

---

## 🎛️ **4. PAGE CONTROL & CONFIGURATION TABLES** (3 tables)

#### **47. `system_config`** - System Configuration
**Purpose**: System-wide configuration settings
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `config_key` (TEXT, UNIQUE, NOT NULL)
- `config_value` (JSONB, NOT NULL)
- `value_type` (TEXT, NOT NULL)
- `description`, `category` (TEXT)
- `updated_by` (INTEGER)
- `updated_at`, `created_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **48. `ticket_title_config`** - Ticket Title Configuration
**Purpose**: Ticket title definitions and configuration
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `ticket_title` (USER-DEFINED, UNIQUE, NOT NULL)
- `display_name` (TEXT, NOT NULL)
- `description` (TEXT)
- `applicable_to_ticket_type`, `applicable_to_service_type`, `applicable_to_source` (ARRAY)
- `default_priority` (USER-DEFINED)
- `default_category` (USER-DEFINED)
- `default_auto_assign` (BOOLEAN, DEFAULT false)
- `default_auto_assign_to_agent_id` (INTEGER, FK → system_users.id)
- `is_active` (BOOLEAN, DEFAULT true)
- `display_order` (INTEGER, DEFAULT 0)
- `metadata` (JSONB, DEFAULT '{}')
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

#### **49. `ticket_auto_generation_rules`** - Ticket Auto-Generation Rules
**Purpose**: Rules for automatically generating tickets
**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `rule_name` (TEXT, UNIQUE, NOT NULL)
- `rule_description` (TEXT)
- `trigger_event` (TEXT, NOT NULL)
- `trigger_conditions` (JSONB, NOT NULL, DEFAULT '{}')
- `ticket_title` (USER-DEFINED, NOT NULL)
- `ticket_type`, `ticket_category` (USER-DEFINED, NOT NULL)
- `service_type` (USER-DEFINED, NOT NULL)
- `priority` (USER-DEFINED, NOT NULL, DEFAULT 'MEDIUM')
- `auto_assign` (BOOLEAN, DEFAULT false)
- `auto_assign_to_agent_id` (INTEGER, FK → system_users.id)
- `auto_assign_to_department` (TEXT)
- `is_active`, `is_enabled` (BOOLEAN, DEFAULT true)
- `metadata` (JSONB, DEFAULT '{}')
- `created_at`, `updated_at` (TIMESTAMP, NOT NULL, DEFAULT now())

**Note**: There are no `dashboard_pages`, `dashboard_widgets`, or `dashboard_user_preferences` tables in the actual schema. These would need to be created if needed for dashboard page management.

---

## 📝 **SUMMARY**

| Category | Tables | Purpose |
|----------|--------|---------|
| **Access Management** | 36 | RBAC, permissions, roles, audit |
| **Device Management** | 2 | Device tracking (rider, customer) |
| **Analytics** | 5 | Metrics, KPIs, usage tracking |
| **Page Control & Config** | 3 | System config, ticket config |
| **TOTAL** | **46** | Complete dashboard control system |

---

## 🔗 **KEY RELATIONSHIPS**

```
system_users (Core)
    ├─→ system_user_auth (1:1)
    ├─→ system_user_sessions (many)
    ├─→ system_user_login_history (many)
    ├─→ system_user_api_keys (many)
    ├─→ system_user_ip_whitelist (many)
    ├─→ user_roles (many) → system_roles → role_permissions → system_permissions
    ├─→ user_permission_overrides (many)
    ├─→ area_assignments (many)
    ├─→ service_scope_assignments (many)
    ├─→ entity_scope_assignments (many)
    ├─→ order_access_controls (1:1)
    ├─→ ticket_access_controls (1:1)
    ├─→ rider_management_access (1:1)
    ├─→ merchant_management_access (1:1)
    ├─→ customer_management_access (1:1)
    ├─→ payment_access_controls (1:1)
    ├─→ payout_access_controls (1:1)
    ├─→ refund_access_controls (1:1)
    ├─→ offer_management_access (1:1)
    ├─→ advertisement_management_access (1:1)
    ├─→ access_restrictions (many)
    ├─→ access_delegation (many)
    ├─→ access_emergency_mode (many)
    ├─→ access_approval_requests (many)
    └─→ system_audit_logs (many)
```

---

## ✅ **TABLES TO ACCESS & UPDATE FROM DASHBOARD**

### **High Priority (Core Management)**
1. `system_users` - User management
2. `system_roles` - Role management
3. `system_permissions` - Permission management
4. `role_permissions` - Role-permission mapping
5. `user_roles` - User-role assignment
6. `user_permission_overrides` - Permission overrides
7. `access_modules` - Module definitions
8. `access_pages` - Page definitions
9. `access_api_endpoints` - API endpoint definitions
10. `access_feature_flags` - Feature flags

### **Medium Priority (Access Controls)**
11. `order_access_controls` - Order access permissions
12. `ticket_access_controls` - Ticket access permissions
13. `rider_management_access` - Rider management permissions
14. `merchant_management_access` - Merchant management permissions
15. `customer_management_access` - Customer management permissions
16. `payment_access_controls` - Payment access permissions
17. `payout_access_controls` - Payout access permissions
18. `refund_access_controls` - Refund access permissions
19. `offer_management_access` - Offer management permissions
20. `advertisement_management_access` - Advertisement permissions

### **Medium Priority (Scope & Restrictions)**
21. `area_assignments` - Geographic access
22. `service_scope_assignments` - Service access
23. `entity_scope_assignments` - Entity-specific access
24. `access_restrictions` - Time/IP-based restrictions
25. `access_delegation` - Temporary access delegation
26. `access_approval_workflows` - Approval workflows
27. `access_approval_requests` - Approval requests
28. `access_emergency_mode` - Emergency access

### **Low Priority (Monitoring & Audit)**
29. `system_audit_logs` - System audit trail
30. `access_activity_logs` - Access activity logs
31. `permission_change_logs` - Permission change history
32. `security_events` - Security incidents
33. `compliance_audit_trail` - Compliance audit
34. `system_user_sessions` - Active sessions
35. `system_user_login_history` - Login history
36. `system_user_api_keys` - API key management

### **Configuration**
37. `system_config` - System configuration
38. `ticket_title_config` - Ticket title configuration
39. `ticket_auto_generation_rules` - Auto-generation rules

### **Analytics (Read-Only)**
40. `rider_daily_analytics` - Rider metrics
41. `customer_daily_analytics` - Customer metrics
42. `merchant_store_daily_analytics` - Merchant metrics
43. `customer_service_analytics` - Service analytics
44. `provider_order_analytics` - Provider analytics

### **Device Management**
45. `rider_devices` - Rider device tracking
46. `customer_devices` - Customer device tracking

---

## 📚 **REFERENCE**

- **Source**: `dashboard/schema.sql` (actual database schema)
- **Last Updated**: Based on current schema.sql file
- **Total Tables**: 46 tables for dashboard control

---

## ✅ **USAGE NOTES**

1. **Access Management**: All 36 tables control who can access what
2. **Device Management**: Track and control device access (2 tables)
3. **Analytics**: Monitor system performance and usage (5 tables, mostly read-only)
4. **Configuration**: System and ticket configuration (3 tables)

**All these tables should be manageable from the dashboard control page.**
