# Access Management API Routes - Implementation Plan

## 📡 **API ROUTES STRUCTURE**

All API routes will be under `/api/` and require authentication. Each route will:
- Check user permissions
- Log activity
- Return standardized responses
- Handle errors gracefully

---

## 👥 **1. USER MANAGEMENT API** (`/api/users`)

### **GET `/api/users`** - List Users
**Purpose**: Get paginated list of users with filters
**Permissions**: `USERS.VIEW`
**Query Params**:
- `page`, `limit` (pagination)
- `search` (name, email)
- `role`, `status`, `department` (filters)
- `sortBy`, `sortOrder`

**Response**:
```json
{
  "success": true,
  "data": {
    "users": [...],
    "pagination": { "page": 1, "limit": 20, "total": 100 }
  }
}
```

### **GET `/api/users/[id]`** - Get User Details
**Purpose**: Get complete user information including roles, permissions, sessions
**Permissions**: `USERS.VIEW`
**Response**: Full user object with related data

### **POST `/api/users`** - Create User
**Purpose**: Create new agent/user
**Permissions**: `USERS.CREATE`
**Body**:
```json
{
  "full_name": "John Doe",
  "email": "john@example.com",
  "mobile": "+919876543210",
  "primary_role": "AGENT",
  "department": "Support",
  "status": "PENDING_ACTIVATION"
}
```
**Actions**:
- Create in `system_users`
- Create in `system_user_auth` (generate temp password)
- Log in `system_audit_logs`
- Send activation email

### **PUT `/api/users/[id]`** - Update User
**Purpose**: Update user details
**Permissions**: `USERS.UPDATE`
**Body**: Partial user object
**Actions**:
- Update `system_users`
- Log changes in `system_audit_logs`
- Track changed fields

### **DELETE `/api/users/[id]`** - Delete User (Soft Delete)
**Purpose**: Soft delete user
**Permissions**: `USERS.DELETE`
**Actions**:
- Set `deleted_at` in `system_users`
- Deactivate all sessions
- Log in `system_audit_logs`

### **POST `/api/users/[id]/activate`** - Activate User
**Purpose**: Activate pending user
**Permissions**: `USERS.UPDATE`
**Actions**:
- Update status to `ACTIVE`
- Set `approved_by`, `approved_at`
- Log activity

### **POST `/api/users/[id]/deactivate`** - Deactivate User
**Purpose**: Deactivate user
**Permissions**: `USERS.UPDATE`
**Actions**:
- Update status to `SUSPENDED` or `DISABLED`
- End all active sessions
- Log activity

### **GET `/api/users/[id]/sessions`** - Get User Sessions
**Purpose**: Get all active/inactive sessions for user
**Permissions**: `USERS.VIEW`
**Response**: Array of sessions from `system_user_sessions`

### **POST `/api/users/[id]/sessions/[sessionId]/revoke`** - Revoke Session
**Purpose**: Revoke specific session
**Permissions**: `USERS.UPDATE`
**Actions**:
- Set `is_active = false`
- Set `logged_out_at`
- Log activity

### **GET `/api/users/[id]/login-history`** - Get Login History
**Purpose**: Get login history
**Permissions**: `USERS.VIEW`
**Query Params**: `limit`, `offset`, `startDate`, `endDate`
**Response**: Array from `system_user_login_history`

### **GET `/api/users/[id]/activity`** - Get User Activity
**Purpose**: Get all user activities
**Permissions**: `USERS.VIEW`
**Response**: Combined data from `access_activity_logs` and `system_audit_logs`

### **GET `/api/users/[id]/devices`** - Get User Devices
**Purpose**: Get devices used by user (if tracked)
**Permissions**: `USERS.VIEW`
**Response**: Device information

### **POST `/api/users/[id]/reset-password`** - Reset Password
**Purpose**: Reset user password
**Permissions**: `USERS.UPDATE`
**Actions**:
- Generate new password
- Update `system_user_auth`
- Send email
- Log activity

---

## 🔐 **2. ROLE MANAGEMENT API** (`/api/roles`)

### **GET `/api/roles`** - List Roles
**Purpose**: Get all roles
**Permissions**: `USERS.VIEW`
**Response**: Array of roles from `system_roles`

### **GET `/api/roles/[id]`** - Get Role Details
**Purpose**: Get role with permissions
**Permissions**: `USERS.VIEW`
**Response**: Role + associated permissions

### **POST `/api/roles`** - Create Role
**Purpose**: Create new role
**Permissions**: `USERS.CREATE`
**Body**:
```json
{
  "role_id": "SUPPORT_L2",
  "role_name": "Support Level 2",
  "role_display_name": "Support Level 2",
  "role_type": "SUPPORT_L2",
  "role_level": 5,
  "is_system_role": false
}
```

### **PUT `/api/roles/[id]`** - Update Role
**Purpose**: Update role
**Permissions**: `USERS.UPDATE`

### **DELETE `/api/roles/[id]`** - Delete Role
**Purpose**: Delete role (if not system role)
**Permissions**: `USERS.DELETE`

### **POST `/api/roles/[id]/permissions`** - Assign Permissions to Role
**Purpose**: Map permissions to role
**Permissions**: `USERS.UPDATE`
**Body**:
```json
{
  "permission_ids": [1, 2, 3],
  "service_scope": ["FOOD", "PARCEL"],
  "geo_scope": ["Mumbai", "Delhi"]
}
```
**Actions**:
- Create entries in `role_permissions`
- Log in `permission_change_logs`

---

## 🔑 **3. PERMISSION MANAGEMENT API** (`/api/permissions`)

### **GET `/api/permissions`** - List Permissions
**Purpose**: Get all permissions grouped by module
**Permissions**: `USERS.VIEW`
**Response**: Permissions grouped by `module_name`

### **GET `/api/permissions/[id]`** - Get Permission Details
**Purpose**: Get permission with roles that have it
**Permissions**: `USERS.VIEW`

### **POST `/api/permissions`** - Create Permission
**Purpose**: Create new permission
**Permissions**: `USERS.CREATE`
**Body**:
```json
{
  "permission_id": "ORDERS_REFUND_APPROVE",
  "permission_name": "orders.refund.approve",
  "module_name": "ORDERS",
  "action": "APPROVE",
  "resource_type": "REFUND",
  "risk_level": "HIGH"
}
```

### **PUT `/api/permissions/[id]`** - Update Permission
**Purpose**: Update permission
**Permissions**: `USERS.UPDATE`

---

## 👤 **4. USER-ROLE ASSIGNMENT API** (`/api/users/[id]/roles`)

### **GET `/api/users/[id]/roles`** - Get User Roles
**Purpose**: Get all roles assigned to user
**Permissions**: `USERS.VIEW`

### **POST `/api/users/[id]/roles`** - Assign Role to User
**Purpose**: Assign role to user
**Permissions**: `USERS.UPDATE`
**Body**:
```json
{
  "role_id": 5,
  "is_primary": false,
  "valid_from": "2025-01-15T00:00:00Z",
  "valid_until": null
}
```
**Actions**:
- Create in `user_roles`
- Log in `permission_change_logs`

### **DELETE `/api/users/[id]/roles/[roleId]`** - Remove Role from User
**Purpose**: Revoke role from user
**Permissions**: `USERS.UPDATE`
**Actions**:
- Set `is_active = false`, `revoked_at`
- Log in `permission_change_logs`

---

## 🎯 **5. PERMISSION OVERRIDES API** (`/api/users/[id]/permission-overrides`)

### **GET `/api/users/[id]/permission-overrides`** - Get Overrides
**Purpose**: Get permission overrides for user
**Permissions**: `USERS.VIEW`

### **POST `/api/users/[id]/permission-overrides`** - Create Override
**Purpose**: Grant or deny specific permission
**Permissions**: `USERS.UPDATE`
**Body**:
```json
{
  "permission_id": 10,
  "override_type": "GRANT",
  "is_allowed": true,
  "override_reason": "Temporary access for project",
  "valid_until": "2025-02-15T00:00:00Z"
}
```

### **DELETE `/api/users/[id]/permission-overrides/[overrideId]`** - Revoke Override
**Purpose**: Remove permission override
**Permissions**: `USERS.UPDATE`

---

## 📄 **6. PAGE ACCESS CONTROL API** (`/api/pages`)

### **GET `/api/pages`** - List Pages
**Purpose**: Get all dashboard pages
**Permissions**: `SETTINGS.VIEW`
**Response**: Pages from `access_pages` with module info

### **GET `/api/pages/[id]`** - Get Page Details
**Purpose**: Get page with required permissions
**Permissions**: `SETTINGS.VIEW`

### **POST `/api/pages`** - Create Page
**Purpose**: Register new dashboard page
**Permissions**: `SETTINGS.CREATE`
**Body**:
```json
{
  "page_id": "dashboard-reports",
  "module_id": 3,
  "page_name": "Reports",
  "route_path": "/dashboard/reports",
  "required_permissions": ["ANALYTICS.VIEW"]
}
```

### **PUT `/api/pages/[id]`** - Update Page
**Purpose**: Update page configuration
**Permissions**: `SETTINGS.UPDATE`

### **GET `/api/pages/check-access`** - Check Page Access
**Purpose**: Check if current user can access page
**Permissions**: None (public for current user)
**Query Params**: `pagePath`
**Response**:
```json
{
  "success": true,
  "data": {
    "canAccess": true,
    "pagePath": "/dashboard/orders",
    "requiredPermissions": ["ORDERS.VIEW"],
    "userHasPermissions": true
  }
}
```

---

## 🚪 **7. API ENDPOINT CONTROL** (`/api/endpoints`)

### **GET `/api/endpoints`** - List API Endpoints
**Purpose**: Get all registered API endpoints
**Permissions**: `SETTINGS.VIEW`

### **POST `/api/endpoints`** - Register Endpoint
**Purpose**: Register API endpoint for access control
**Permissions**: `SETTINGS.CREATE`

### **PUT `/api/endpoints/[id]`** - Update Endpoint
**Purpose**: Update endpoint permissions/rate limits
**Permissions**: `SETTINGS.UPDATE`

---

## 🎛️ **8. FEATURE FLAGS API** (`/api/feature-flags`)

### **GET `/api/feature-flags`** - List Feature Flags
**Purpose**: Get all feature flags
**Permissions**: `SETTINGS.VIEW`

### **POST `/api/feature-flags`** - Create Feature Flag
**Purpose**: Create new feature flag
**Permissions**: `SETTINGS.CREATE`

### **PUT `/api/feature-flags/[id]`** - Update Feature Flag
**Purpose**: Enable/disable feature flag
**Permissions**: `SETTINGS.UPDATE`

---

## 📍 **9. AREA & SCOPE ASSIGNMENTS API** (`/api/users/[id]/assignments`)

### **GET `/api/users/[id]/area-assignments`** - Get Area Assignments
**Purpose**: Get geographic access for user
**Permissions**: `USERS.VIEW`

### **POST `/api/users/[id]/area-assignments`** - Assign Area
**Purpose**: Assign geographic area to user
**Permissions**: `USERS.UPDATE`

### **GET `/api/users/[id]/service-scope-assignments`** - Get Service Scope
**Purpose**: Get service access levels
**Permissions**: `USERS.VIEW`

### **POST `/api/users/[id]/service-scope-assignments`** - Assign Service Scope
**Purpose**: Assign service access
**Permissions**: `USERS.UPDATE`

### **GET `/api/users/[id]/entity-scope-assignments`** - Get Entity Scope
**Purpose**: Get entity-specific access
**Permissions**: `USERS.VIEW`

### **POST `/api/users/[id]/entity-scope-assignments`** - Assign Entity Access
**Purpose**: Grant access to specific entity
**Permissions**: `USERS.UPDATE`

---

## 🔒 **10. ACCESS RESTRICTIONS API** (`/api/users/[id]/restrictions`)

### **GET `/api/users/[id]/restrictions`** - Get Restrictions
**Purpose**: Get all access restrictions
**Permissions**: `USERS.VIEW`

### **POST `/api/users/[id]/restrictions`** - Create Restriction
**Purpose**: Add time/IP/location restriction
**Permissions**: `USERS.UPDATE`
**Body**:
```json
{
  "restriction_type": "TIME_BASED",
  "allowed_days": ["MONDAY", "TUESDAY", "WEDNESDAY"],
  "allowed_time_start": "09:00:00",
  "allowed_time_end": "18:00:00",
  "allowed_ips": ["192.168.1.0/24"]
}
```

### **PUT `/api/users/[id]/restrictions/[id]`** - Update Restriction
**Purpose**: Update restriction
**Permissions**: `USERS.UPDATE`

### **DELETE `/api/users/[id]/restrictions/[id]`** - Remove Restriction
**Purpose**: Remove restriction
**Permissions**: `USERS.UPDATE`

---

## 📊 **11. ACTIVITY & AUDIT API** (`/api/activity`)

### **GET `/api/activity`** - Get Activity Logs
**Purpose**: Get activity logs with filters
**Permissions**: `AUDIT.VIEW`
**Query Params**:
- `userId`, `actionType`, `entityType`
- `startDate`, `endDate`
- `page`, `limit`

### **GET `/api/activity/[id]`** - Get Activity Details
**Purpose**: Get detailed activity log
**Permissions**: `AUDIT.VIEW`

### **GET `/api/audit`** - Get Audit Logs
**Purpose**: Get system audit logs
**Permissions**: `AUDIT.VIEW`

### **GET `/api/security-events`** - Get Security Events
**Purpose**: Get security incidents
**Permissions**: `AUDIT.VIEW`

### **POST `/api/security-events/[id]/resolve`** - Resolve Security Event
**Purpose**: Mark security event as resolved
**Permissions**: `AUDIT.UPDATE`

---

## 🔑 **12. API KEYS MANAGEMENT** (`/api/users/[id]/api-keys`)

### **GET `/api/users/[id]/api-keys`** - Get API Keys
**Purpose**: Get all API keys for user
**Permissions**: `USERS.VIEW`

### **POST `/api/users/[id]/api-keys`** - Create API Key
**Purpose**: Generate new API key
**Permissions**: `USERS.UPDATE`
**Response**: Returns key once (store securely)

### **DELETE `/api/users/[id]/api-keys/[keyId]`** - Revoke API Key
**Purpose**: Revoke API key
**Permissions**: `USERS.UPDATE`

---

## 📋 **13. DOMAIN-SPECIFIC ACCESS CONTROLS**

### **GET `/api/users/[id]/access-controls`** - Get All Access Controls
**Purpose**: Get all domain-specific access controls
**Permissions**: `USERS.VIEW`
**Response**: Combined data from all `*_access_controls` tables

### **PUT `/api/users/[id]/order-access-controls`** - Update Order Access
**Purpose**: Update order access permissions
**Permissions**: `USERS.UPDATE`

### **PUT `/api/users/[id]/ticket-access-controls`** - Update Ticket Access
**Purpose**: Update ticket access permissions
**Permissions**: `USERS.UPDATE`

### **PUT `/api/users/[id]/rider-management-access`** - Update Rider Access
**Purpose**: Update rider management permissions
**Permissions**: `USERS.UPDATE`

### **PUT `/api/users/[id]/merchant-management-access`** - Update Merchant Access
**Purpose**: Update merchant management permissions
**Permissions**: `USERS.UPDATE`

### **PUT `/api/users/[id]/customer-management-access`** - Update Customer Access
**Purpose**: Update customer management permissions
**Permissions**: `USERS.UPDATE`

### **PUT `/api/users/[id]/payment-access-controls`** - Update Payment Access
**Purpose**: Update payment access permissions
**Permissions**: `USERS.UPDATE`

### **PUT `/api/users/[id]/payout-access-controls`** - Update Payout Access
**Purpose**: Update payout access permissions
**Permissions**: `USERS.UPDATE`

### **PUT `/api/users/[id]/refund-access-controls`** - Update Refund Access
**Purpose**: Update refund access permissions
**Permissions**: `USERS.UPDATE`

### **PUT `/api/users/[id]/offer-management-access`** - Update Offer Access
**Purpose**: Update offer management permissions
**Permissions**: `USERS.UPDATE`

### **PUT `/api/users/[id]/advertisement-management-access`** - Update Ad Access
**Purpose**: Update advertisement permissions
**Permissions**: `USERS.UPDATE`

---

## 🔄 **14. ACCESS DELEGATION API** (`/api/delegation`)

### **GET `/api/delegation`** - List Delegations
**Purpose**: Get all active delegations
**Permissions**: `USERS.VIEW`

### **POST `/api/delegation`** - Create Delegation
**Purpose**: Delegate access temporarily
**Permissions**: `USERS.UPDATE`
**Body**:
```json
{
  "delegate_user_id": 10,
  "delegated_permissions": [1, 2, 3],
  "delegated_roles": [5],
  "delegation_reason": "Covering for vacation",
  "valid_until": "2025-02-01T00:00:00Z"
}
```

### **POST `/api/delegation/[id]/revoke`** - Revoke Delegation
**Purpose**: Revoke delegation
**Permissions**: `USERS.UPDATE`

---

## ⚠️ **15. EMERGENCY MODE API** (`/api/emergency-mode`)

### **GET `/api/emergency-mode`** - Get Emergency Modes
**Purpose**: Get active emergency modes
**Permissions**: `USERS.VIEW`

### **POST `/api/emergency-mode`** - Activate Emergency Mode
**Purpose**: Activate emergency access
**Permissions**: `USERS.UPDATE` (requires approval)
**Body**:
```json
{
  "system_user_id": 5,
  "emergency_reason": "Critical system issue",
  "emergency_type": "SYSTEM_MAINTENANCE",
  "elevated_permissions": ["ORDERS.UPDATE", "ORDERS.DELETE"],
  "expires_at": "2025-01-15T23:59:59Z"
}
```

### **POST `/api/emergency-mode/[id]/revoke`** - Revoke Emergency Mode
**Purpose**: Revoke emergency access
**Permissions**: `USERS.UPDATE`

---

## ✅ **STANDARD RESPONSE FORMAT**

All API routes return:
```json
{
  "success": boolean,
  "data": any,
  "error": string | null,
  "pagination": { "page": number, "limit": number, "total": number } | null
}
```

---

## 🔐 **PERMISSION CHECKING**

Every API route will:
1. Authenticate user (via Supabase session)
2. Check required permission (via `checkPermission`)
3. Log activity (via `logActivity`)
4. Return response

---

## 📝 **ACTIVITY LOGGING**

All API routes automatically log to:
- `access_activity_logs` - For access-related activities
- `system_audit_logs` - For system changes
- `permission_change_logs` - For permission changes
