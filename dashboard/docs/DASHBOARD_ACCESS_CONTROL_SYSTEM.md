# Dashboard Access Control System - Complete Documentation

## Overview

This system provides comprehensive role-based access control (RBAC) for the dashboard application. It controls which dashboards users can access and what actions they can perform within each dashboard.

## Tables Used (3 Core Tables)

### 1. `dashboard_access`
**Purpose**: Stores which dashboards each user can access

**Columns**:
- `id` (BIGSERIAL PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id)
- `dashboard_type` (TEXT) - One of: RIDER, MERCHANT, CUSTOMER, ORDER, TICKET, OFFER, AREA_MANAGER, PAYMENT, SYSTEM, ANALYTICS
- `access_level` (TEXT) - VIEW_ONLY, FULL_ACCESS, or RESTRICTED
- `is_active` (BOOLEAN)
- `granted_by` (BIGINT, FK → system_users.id)
- `granted_by_name` (TEXT)
- `granted_at` (TIMESTAMP)
- `revoked_at` (TIMESTAMP, nullable)
- `revoked_by` (BIGINT, FK → system_users.id, nullable)
- `revoke_reason` (TEXT, nullable)
- `created_at`, `updated_at` (TIMESTAMP)

**Controls**: Dashboard-level visibility (which dashboards appear in sidebar and home page)

### 2. `dashboard_access_points`
**Purpose**: Stores grouped access points (actions) within each dashboard

**Columns**:
- `id` (BIGSERIAL PRIMARY KEY)
- `system_user_id` (BIGINT, FK → system_users.id)
- `dashboard_type` (TEXT)
- `access_point_group` (TEXT) - e.g., ORDER_VIEW, ORDER_CANCEL_ASSIGN, ORDER_REFUND_DELIVER
- `access_point_name` (TEXT) - Display name
- `access_point_description` (TEXT)
- `allowed_actions` (JSONB) - Array of allowed actions: ["VIEW", "UPDATE", "CANCEL", "ASSIGN", "REFUND", etc.]
- `context` (JSONB) - Additional context (e.g., ticket category/type)
- `is_active` (BOOLEAN)
- `granted_by`, `granted_by_name`, `granted_at`, `revoked_at`, `revoked_by`, `revoke_reason`
- `created_at`, `updated_at` (TIMESTAMP)

**Controls**: Action-level permissions (what actions user can perform within a dashboard)

### 3. `action_audit_log`
**Purpose**: Tracks ALL actions performed by agents on dashboards

**Columns**:
- `id` (BIGSERIAL PRIMARY KEY)
- `agent_id` (BIGINT, FK → system_users.id)
- `agent_email` (TEXT)
- `agent_name` (TEXT)
- `agent_role` (TEXT)
- `dashboard_type` (TEXT)
- `action_type` (TEXT) - VIEW, CREATE, UPDATE, DELETE, CANCEL, REFUND, etc.
- `resource_type` (TEXT) - RIDER, ORDER, TICKET, MERCHANT, etc.
- `resource_id` (TEXT)
- `action_details` (JSONB) - Full details of what was changed
- `previous_values` (JSONB) - Previous state (for updates)
- `new_values` (JSONB) - New state (for updates)
- `ip_address` (TEXT)
- `user_agent` (TEXT)
- `request_path` (TEXT)
- `request_method` (TEXT)
- `action_status` (TEXT) - SUCCESS, FAILED, or PENDING
- `error_message` (TEXT, nullable)
- `created_at` (TIMESTAMP)

**Tracks**: Every action with full context for audit and compliance

## Enums Defined

All enums are defined in `dashboard/src/lib/db/schema.ts`:

### `DashboardType` (10 types)
- RIDER
- MERCHANT
- CUSTOMER
- ORDER
- TICKET
- OFFER
- AREA_MANAGER
- PAYMENT
- SYSTEM
- ANALYTICS

### `AccessLevel` (3 levels)
- VIEW_ONLY
- FULL_ACCESS
- RESTRICTED

### `AccessPointGroup` (24+ groups)
**Rider Dashboard**:
- RIDER_VIEW
- RIDER_ACTIONS

**Merchant Dashboard**:
- MERCHANT_VIEW
- MERCHANT_ONBOARDING
- MERCHANT_OPERATIONS
- MERCHANT_STORE_MANAGEMENT
- MERCHANT_WALLET

**Customer Dashboard**:
- CUSTOMER_VIEW
- CUSTOMER_ACTIONS

**Order Dashboard** (3 groups):
- ORDER_VIEW - View order details
- ORDER_CANCEL_ASSIGN - Cancel ride, assign rider, add remark
- ORDER_REFUND_DELIVER - Cancel with refund, update deliver status

**Ticket Dashboard**:
- TICKET_VIEW
- TICKET_MERCHANT
- TICKET_CUSTOMER
- TICKET_RIDER
- TICKET_OTHER
- TICKET_ACTIONS

**Offer Dashboard**:
- OFFER_RIDER
- OFFER_CUSTOMER
- OFFER_MERCHANT

**Area Manager Dashboard**:
- AREA_MANAGER_MERCHANT
- AREA_MANAGER_RIDER

**Payment Dashboard**:
- PAYMENT_MANAGEMENT (Super Admin Only)

### `ActionType` (13+ actions)
- VIEW
- CREATE
- UPDATE
- DELETE
- APPROVE
- REJECT
- ASSIGN
- CANCEL
- REFUND
- BLOCK
- UNBLOCK
- EXPORT
- IMPORT

## How It Works

### 1. User Creation & Access Assignment

**Super Admin Flow**:
1. Super admin navigates to `/dashboard/users/new`
2. Fills in user details (name, email, role, etc.)
3. Selects dashboards user can access (checkboxes)
4. For each selected dashboard, selects access point groups
5. Saves → Creates user + dashboard access records + access point records

**API**: `POST /api/users`
- Creates user in `system_users` table
- Creates records in `dashboard_access` table
- Creates records in `dashboard_access_points` table
- Logs action to `action_audit_log`

### 2. Dashboard Visibility Control

**Home Page** (`/dashboard`):
- Fetches user's dashboard access from `/api/auth/dashboard-access`
- Filters dashboard cards based on `dashboard_access` table
- Super admins see all dashboards
- Regular users only see dashboards they have access to

**Sidebar**:
- Uses `useDashboardAccess()` hook
- Filters navigation items based on `dashboard_access` table
- Hides dashboards user doesn't have access to

**Individual Pages**:
- Each dashboard page calls `requireDashboardAccess(dashboardType)`
- Server-side check using `dashboard_access` table
- Redirects to `/dashboard` if no access

### 3. Action Permission Checks

**Before performing any action**:
1. Check if user has dashboard access (`dashboard_access` table)
2. Check if user has access point that allows the action (`dashboard_access_points` table)
3. Check if action is in `allowed_actions` array
4. For tickets, also check context (category/type)

**Helper Functions** (in `dashboard/src/lib/permissions/actions.ts`):
- `canCancelRide()` - Checks ORDER_CANCEL_ASSIGN
- `canAssignRider()` - Checks ORDER_CANCEL_ASSIGN
- `canAddOrderRemark()` - Checks ORDER_CANCEL_ASSIGN
- `canRefundOrder()` - Checks ORDER_REFUND_DELIVER
- `canUpdateDeliver()` - Checks ORDER_REFUND_DELIVER
- `canCancelOrderWithRefund()` - Checks ORDER_REFUND_DELIVER

### 4. Action Tracking

**Every action is logged**:
- User management actions (create, update, delete users)
- Dashboard access changes
- All dashboard actions (when implemented)

**Audit Log Viewer**:
- Super admin can view all actions at `/dashboard/audit`
- Filter by agent, dashboard, action type, date range
- Export functionality

## ORDER Dashboard Access Points (3 Groups)

### 1. ORDER_VIEW
- **Actions**: VIEW
- **Purpose**: View order information and details
- **Use Case**: Read-only access to orders

### 2. ORDER_CANCEL_ASSIGN
- **Actions**: UPDATE, CANCEL, ASSIGN
- **Purpose**: Cancel ride, assign new rider, add remark
- **Use Case**: Operational actions that don't involve refunds

### 3. ORDER_REFUND_DELIVER
- **Actions**: CANCEL, REFUND, UPDATE
- **Purpose**: Cancel order with refund, update deliver status
- **Use Case**: Financial actions and delivery updates

## Super Admin Management

### Creating Users with Access
1. Go to `/dashboard/users/new`
2. Fill user details
3. Select dashboards (Dashboard Access & Permissions section)
4. For each dashboard, select access point groups
5. Save → User created with access

### Updating User Access
1. Go to `/dashboard/users/[id]`
2. Click "Manage Dashboard Access" or go to `/dashboard/users/[id]/access`
3. Modify dashboard selections
4. Modify access point selections
5. Save → Access updated

### Viewing Audit Logs
1. Go to `/dashboard/audit`
2. Filter by agent, dashboard, action type, date range
3. View all actions performed
4. Export if needed

## Migration

**Critical**: The migration `0042_dashboard_access_control.sql` MUST be run before the system works.

**To Run Migration**:
1. **Option 1 (Recommended)**: Supabase SQL Editor
   - Open Supabase Dashboard → SQL Editor
   - Copy contents of `dashboard/drizzle/0042_dashboard_access_control.sql`
   - Paste and execute

2. **Option 2**: Command Line
   ```bash
   cd dashboard
   psql $DATABASE_URL -f drizzle/0042_dashboard_access_control.sql
   ```

3. **Option 3**: Migration Script
   ```bash
   cd dashboard
   npm run migrate
   ```

**Verify Migration**:
```bash
npm run verify-migration
```

Or check manually:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('dashboard_access', 'dashboard_access_points', 'action_audit_log');
```

## API Endpoints

### User Management
- `GET /api/users` - List users
- `POST /api/users` - Create user (with dashboard access)
- `GET /api/users/[id]` - Get user details
- `PUT /api/users/[id]` - Update user (with dashboard access)
- `GET /api/users/[id]/access` - Get user's dashboard access
- `PUT /api/users/[id]/access` - Update user's dashboard access

### Access Control
- `GET /api/auth/permissions` - Get current user's permissions
- `GET /api/auth/dashboard-access` - Get current user's dashboard access
- `POST /api/auth/permissions/check` - Check if user can access a page

### Audit
- `GET /api/audit` - Get audit logs (super admin only)
- `GET /api/audit/export` - Export audit logs (super admin only)

### Health Check
- `GET /api/health/db` - Check database connection and tables

## Files Structure

### Core Files
- `dashboard/src/lib/db/schema.ts` - Database schema and types
- `dashboard/src/lib/permissions/engine.ts` - Permission checking engine
- `dashboard/src/lib/permissions/actions.ts` - Action-level permission checks
- `dashboard/src/lib/permissions/page-protection.ts` - Page protection utilities
- `dashboard/src/lib/audit/logger.ts` - Audit logging utility
- `dashboard/src/lib/audit/middleware.ts` - Auto-tracking middleware

### UI Components
- `dashboard/src/components/users/UserForm.tsx` - User creation/edit form
- `dashboard/src/components/users/DashboardAccessSelector.tsx` - Access point selector
- `dashboard/src/app/dashboard/users/new/page.tsx` - Create user page
- `dashboard/src/app/dashboard/users/[id]/access/page.tsx` - Manage access page
- `dashboard/src/app/dashboard/audit/page.tsx` - Audit log viewer

### API Routes
- `dashboard/src/app/api/users/route.ts` - User CRUD
- `dashboard/src/app/api/users/[id]/route.ts` - User details/update
- `dashboard/src/app/api/users/[id]/access/route.ts` - Access management
- `dashboard/src/app/api/audit/route.ts` - Audit log API
- `dashboard/src/app/api/health/db/route.ts` - Health check

## Testing Checklist

1. ✅ Run migration `0042_dashboard_access_control.sql`
2. ✅ Verify all 3 tables exist
3. ✅ Create user with ORDER access - verify 3 access point groups appear
4. ✅ Test ORDER_VIEW access - can view orders
5. ✅ Test ORDER_CANCEL_ASSIGN access - can cancel ride, assign rider
6. ✅ Test ORDER_REFUND_DELIVER access - can refund, update deliver
7. ✅ Verify all actions are logged to `action_audit_log`
8. ✅ Test audit log viewer displays all actions
9. ✅ Verify enums are used throughout codebase
10. ✅ Test super admin can create users and assign access

## Troubleshooting

### Error: "relation dashboard_access does not exist"
**Solution**: Run migration `0042_dashboard_access_control.sql`

### User sees no dashboards
**Solution**: Grant dashboard access via user management page

### Actions not being logged
**Solution**: Ensure `logActionByAuth()` is called in action endpoints

### Access points not appearing in UI
**Solution**: Check `DashboardAccessSelector` has correct definitions

## Summary

**3 Tables Control Everything**:
1. `dashboard_access` - Which dashboards user can see
2. `dashboard_access_points` - What actions user can perform
3. `action_audit_log` - Complete history of all actions

**Super Admin Can**:
- Create users with dashboard access
- Update user access anytime
- View all actions in audit log
- Track every action with full context

**Regular Users**:
- Only see dashboards they have access to
- Can only perform actions they have access points for
- All actions are tracked automatically
