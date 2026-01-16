# Hybrid Authentication & Authorization Architecture

## Overview

This document describes the enterprise-grade hybrid authentication and authorization system for the GatiMitra platform. The system uses **Supabase Auth for authentication** (identity verification) and **custom backend for authorization** (permissions, roles, access control).

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT APPLICATIONS                      │
│  (Web Dashboard, Mobile Apps, Merchant Portal, Customer App)    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP/HTTPS
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    SUPABASE AUTH LAYER                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  • Email/Password Login                                  │   │
│  │  • Email OTP / Magic Links                                │   │
│  │  • Phone OTP (SMS)                                       │   │
│  │  • Session Management                                    │   │
│  │  • JWT Token Issuance                                    │   │
│  │  • Refresh Token Management                              │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ JWT Token
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                  NEXT.JS MIDDLEWARE / API LAYER                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  1. Verify JWT Token (Supabase)                          │   │
│  │  2. Extract User ID & Email                              │   │
│  │  3. Map to system_users table                            │   │
│  │  4. Check Account Status (Active/Suspended/Banned)       │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ User ID + Email
                             │
┌────────────────────────────▼────────────────────────────────────┐
│              CUSTOM AUTHORIZATION ENGINE                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  • Fetch User Roles (user_roles + system_roles)          │   │
│  │  • Fetch Permissions (role_permissions + overrides)      │   │
│  │  • Check Domain Access (area_assignments)                │   │
│  │  • Verify Page Access                                    │   │
│  │  • Verify Action Permissions                             │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Allow/Deny
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    BUSINESS LOGIC LAYER                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  • Process Request                                        │   │
│  │  • Apply Business Rules                                   │   │
│  │  • Audit Logging                                         │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ SQL Queries
                             │
┌────────────────────────────▼────────────────────────────────────┐
│              POSTGRESQL DATABASE (RLS ENABLED)                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  • system_users                                          │   │
│  │  • system_roles                                          │   │
│  │  • system_permissions                                    │   │
│  │  • user_roles                                            │   │
│  │  • role_permissions                                      │   │
│  │  • user_permission_overrides                             │   │
│  │  • admin_action_logs (Audit Trail)                       │   │
│  │  • Row Level Security (RLS) Policies                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Authentication Flow

### 1. Login Process

```
User → Login Form (Email/Password or OTP)
  ↓
Supabase Auth → Verify Credentials
  ↓
Supabase Auth → Issue JWT Token
  ↓
Client → Store Token (HttpOnly Cookie)
  ↓
Client → Redirect to Dashboard
  ↓
Middleware → Verify JWT
  ↓
Middleware → Map to system_users
  ↓
Middleware → Check Account Status
  ↓
Middleware → Check Page Permissions
  ↓
Allow/Deny Access
```

### 2. Permission Check Flow

```
Request → API Route / Page
  ↓
Extract JWT → Get User ID & Email
  ↓
Query system_users → Get system_user.id
  ↓
Check Account Status:
  - status = 'ACTIVE'?
  - deleted_at IS NULL?
  - account_locked_until IS NULL or past?
  ↓
Query user_roles → Get All Roles
  ↓
Query role_permissions → Get Permissions from Roles
  ↓
Query user_permission_overrides → Apply Overrides
  ↓
Check Permission:
  - Module matches?
  - Action matches?
  - Resource type matches? (if specified)
  ↓
Allow/Deny
```

## Database Schema

### Core Tables

#### system_users
- Maps Supabase auth users to internal system users
- Stores: email, mobile, name, status, roles
- **Key Field**: `email` (links to `auth.users.email`)

#### system_roles
- Defines roles (SUPER_ADMIN, ADMIN, AGENT, etc.)
- Role hierarchy support
- System vs custom roles

#### system_permissions
- Granular permissions (MODULE + ACTION + RESOURCE_TYPE)
- Risk levels, approval requirements

#### user_roles
- Maps users to roles
- Supports multiple roles per user
- Validity periods, primary role flag

#### role_permissions
- Maps roles to permissions
- Service scope, geo scope

#### user_permission_overrides
- Grant/revoke specific permissions
- Override role-based permissions

### User Mapping Strategy

**Current Implementation:**
- Email-based mapping: `system_users.email = auth.users.email`
- This is the primary link between Supabase Auth and our system

**Future Enhancement:**
- Add `supabase_auth_id` column to `system_users` table
- Store `auth.users.id` (UUID) for direct lookup
- Fallback to email if UUID not found

## Row Level Security (RLS) Policies

### Example RLS Policies

```sql
-- Policy: Users can only see their own data
CREATE POLICY "Users can view own data"
ON system_users
FOR SELECT
USING (auth.uid()::text = (SELECT supabase_auth_id FROM system_users WHERE id = system_users.id));

-- Policy: Only active users can access
CREATE POLICY "Only active users"
ON system_users
FOR SELECT
USING (
  status = 'ACTIVE' 
  AND deleted_at IS NULL
  AND (account_locked_until IS NULL OR account_locked_until < NOW())
);

-- Policy: Super Admins can see all
CREATE POLICY "Super admins see all"
ON system_users
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN system_roles sr ON ur.role_id = sr.id
    WHERE ur.system_user_id = system_users.id
    AND sr.role_type = 'SUPER_ADMIN'
    AND ur.is_active = true
  )
);
```

## Security Best Practices

### 1. Authentication (Supabase)
- ✅ Use HttpOnly cookies for tokens
- ✅ Enable refresh token rotation
- ✅ Set appropriate token expiration
- ✅ Validate tokens on every request
- ✅ Use secure password requirements

### 2. Authorization (Custom)
- ✅ **Never trust frontend** - Always verify server-side
- ✅ Check permissions on every API route
- ✅ Fail closed (deny on error)
- ✅ Log all permission checks
- ✅ Cache permission queries (with invalidation)

### 3. Database Security
- ✅ Enable RLS on all tables
- ✅ Use connection pooling
- ✅ Parameterized queries (Drizzle ORM)
- ✅ Audit logging for sensitive operations
- ✅ Regular security audits

### 4. Session Management
- ✅ Track active sessions
- ✅ Support force logout
- ✅ Session timeout
- ✅ Device tracking
- ✅ IP whitelisting (optional)

## Common Mistakes to Avoid

### ❌ DON'T:
1. **Use Supabase Auth roles for authorization**
   - Supabase roles are for database RLS, not app logic
   - Use custom `system_roles` instead

2. **Trust frontend permission checks**
   - Always verify server-side
   - Frontend checks are for UX only

3. **Skip account status checks**
   - Always verify user is ACTIVE
   - Check for suspensions, bans, locks

4. **Hardcode roles/permissions**
   - Use database-driven RBAC
   - Support dynamic role assignment

5. **Skip audit logging**
   - Log all sensitive actions
   - Track who did what, when, from where

6. **Allow direct database access**
   - All access through API
   - RLS as additional security layer

### ✅ DO:
1. **Separate authentication and authorization**
   - Supabase = Auth (identity)
   - Custom = Authorization (permissions)

2. **Implement proper error handling**
   - Fail closed (deny on error)
   - Log errors for debugging

3. **Cache permission queries**
   - Reduce database load
   - Invalidate on role/permission changes

4. **Support multiple roles per user**
   - Users can have multiple roles
   - Check all roles for permissions

5. **Implement approval workflows**
   - Require approval for sensitive actions
   - Track approval history

## Future-Proofing

### Scalability
- ✅ Permission query caching (Redis)
- ✅ Database read replicas
- ✅ Connection pooling
- ✅ Indexed queries

### Extensibility
- ✅ Plugin-based permission system
- ✅ Custom permission types
- ✅ Dynamic role creation
- ✅ Feature flags

### Compliance
- ✅ GDPR compliance (data access logs)
- ✅ SOC2 readiness (audit trails)
- ✅ Data retention policies
- ✅ Privacy controls

### Monitoring
- ✅ Permission check metrics
- ✅ Failed auth attempts tracking
- ✅ Session analytics
- ✅ Security alerts

## Implementation Status

- ✅ Supabase Auth integration
- ✅ Custom authorization engine structure
- ✅ User mapping (email-based)
- ✅ Permission checking functions
- ✅ Middleware integration
- ⚠️ Database queries (needs schema imports)
- ⚠️ RLS policies (needs implementation)
- ⚠️ Force logout (needs Supabase Admin API)
- ⚠️ Audit logging (needs implementation)

## Next Steps

1. **Complete Database Integration**
   - Import schema tables properly
   - Implement actual Drizzle queries
   - Test permission queries

2. **Add RLS Policies**
   - Create policies for all tables
   - Test with different user roles
   - Document policy behavior

3. **Implement Force Logout**
   - Use Supabase Admin API
   - Invalidate all sessions
   - Update session tracking

4. **Add Audit Logging**
   - Log all sensitive actions
   - Create audit dashboard
   - Set up alerts

5. **Performance Optimization**
   - Add permission caching
   - Optimize database queries
   - Add query monitoring
