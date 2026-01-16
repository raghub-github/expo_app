# Access Management Database Operations

## 🗄️ **DATABASE OPERATIONS BY TABLE**

This document outlines all database operations (CRUD) needed for each table.

---

## 👥 **USER MANAGEMENT TABLES**

### **1. `system_users`**

#### **Create User**
```typescript
async function createSystemUser(data: {
  system_user_id: string;
  full_name: string;
  email: string;
  mobile: string;
  primary_role: string;
  // ... other fields
}) {
  const db = getDb();
  const [user] = await db.insert(systemUsers)
    .values({
      ...data,
      status: 'PENDING_ACTIVATION',
      created_at: new Date(),
    })
    .returning();
  return user;
}
```

#### **Update User**
```typescript
async function updateSystemUser(id: number, updates: Partial<SystemUser>) {
  const db = getDb();
  const [updated] = await db.update(systemUsers)
    .set({
      ...updates,
      updated_at: new Date(),
    })
    .where(eq(systemUsers.id, id))
    .returning();
  return updated;
}
```

#### **Get User by Email**
```typescript
async function getSystemUserByEmail(email: string) {
  const db = getDb();
  const [user] = await db.select()
    .from(systemUsers)
    .where(eq(systemUsers.email, email.toLowerCase()))
    .limit(1);
  return user;
}
```

#### **List Users with Filters**
```typescript
async function listSystemUsers(filters: {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
}) {
  const db = getDb();
  let query = db.select().from(systemUsers);
  
  if (filters.search) {
    query = query.where(
      or(
        ilike(systemUsers.full_name, `%${filters.search}%`),
        ilike(systemUsers.email, `%${filters.search}%`)
      )
    );
  }
  
  if (filters.role) {
    query = query.where(eq(systemUsers.primary_role, filters.role));
  }
  
  if (filters.status) {
    query = query.where(eq(systemUsers.status, filters.status));
  }
  
  const offset = (filters.page || 1 - 1) * (filters.limit || 20);
  return query.limit(filters.limit || 20).offset(offset);
}
```

### **2. `system_user_auth`**

#### **Create Auth Record**
```typescript
async function createUserAuth(systemUserId: number, passwordHash: string) {
  const db = getDb();
  await db.insert(systemUserAuth)
    .values({
      system_user_id: systemUserId,
      password_hash: passwordHash,
      password_last_changed_at: new Date(),
    });
}
```

#### **Update Password**
```typescript
async function updatePassword(systemUserId: number, newHash: string) {
  const db = getDb();
  await db.update(systemUserAuth)
    .set({
      password_hash: newHash,
      password_last_changed_at: new Date(),
    })
    .where(eq(systemUserAuth.system_user_id, systemUserId));
}
```

### **3. `system_user_sessions`**

#### **Create Session**
```typescript
async function createSession(data: {
  system_user_id: number;
  session_token: string;
  refresh_token?: string;
  device_id?: string;
  ip_address: string;
  user_agent?: string;
  expires_at: Date;
}) {
  const db = getDb();
  const [session] = await db.insert(systemUserSessions)
    .values({
      ...data,
      is_active: true,
      created_at: new Date(),
      last_activity_at: new Date(),
    })
    .returning();
  return session;
}
```

#### **Get Active Sessions**
```typescript
async function getActiveSessions(systemUserId: number) {
  const db = getDb();
  return db.select()
    .from(systemUserSessions)
    .where(
      and(
        eq(systemUserSessions.system_user_id, systemUserId),
        eq(systemUserSessions.is_active, true),
        sql`expires_at > NOW()`
      )
    );
}
```

#### **Revoke Session**
```typescript
async function revokeSession(sessionId: number) {
  const db = getDb();
  await db.update(systemUserSessions)
    .set({
      is_active: false,
      logged_out_at: new Date(),
    })
    .where(eq(systemUserSessions.id, sessionId));
}
```

### **4. `system_user_login_history`**

#### **Log Login Attempt**
```typescript
async function logLoginAttempt(data: {
  system_user_id: number;
  login_method: string;
  login_success: boolean;
  device_id?: string;
  ip_address?: string;
  failure_reason?: string;
  session_id?: number;
}) {
  const db = getDb();
  await db.insert(systemUserLoginHistory)
    .values({
      ...data,
      created_at: new Date(),
    });
}
```

---

## 🔐 **ROLES & PERMISSIONS TABLES**

### **5. `system_roles`**

#### **Create Role**
```typescript
async function createRole(data: {
  role_id: string;
  role_name: string;
  role_display_name: string;
  role_type: string;
  role_level: number;
}) {
  const db = getDb();
  const [role] = await db.insert(systemRoles)
    .values({
      ...data,
      is_active: true,
      created_at: new Date(),
    })
    .returning();
  return role;
}
```

#### **Get Role with Permissions**
```typescript
async function getRoleWithPermissions(roleId: number) {
  const db = getDb();
  const role = await db.select()
    .from(systemRoles)
    .where(eq(systemRoles.id, roleId))
    .limit(1);
  
  const permissions = await db
    .select({
      permission: systemPermissions,
      rolePermission: rolePermissions,
    })
    .from(rolePermissions)
    .innerJoin(systemPermissions, eq(rolePermissions.permission_id, systemPermissions.id))
    .where(eq(rolePermissions.role_id, roleId));
  
  return { role, permissions };
}
```

### **6. `system_permissions`**

#### **Create Permission**
```typescript
async function createPermission(data: {
  permission_id: string;
  permission_name: string;
  module_name: string;
  action: string;
  resource_type?: string;
}) {
  const db = getDb();
  const [permission] = await db.insert(systemPermissions)
    .values({
      ...data,
      is_active: true,
      created_at: new Date(),
    })
    .returning();
  return permission;
}
```

### **7. `role_permissions`**

#### **Assign Permission to Role**
```typescript
async function assignPermissionToRole(data: {
  role_id: number;
  permission_id: number;
  service_scope?: string[];
  geo_scope?: string[];
  granted_by: number;
}) {
  const db = getDb();
  await db.insert(rolePermissions)
    .values({
      ...data,
      is_active: true,
      granted_at: new Date(),
      created_at: new Date(),
    });
}
```

### **8. `user_roles`**

#### **Assign Role to User**
```typescript
async function assignRoleToUser(data: {
  system_user_id: number;
  role_id: number;
  is_primary: boolean;
  assigned_by: number;
  valid_from?: Date;
  valid_until?: Date;
}) {
  const db = getDb();
  await db.insert(userRoles)
    .values({
      ...data,
      is_active: true,
      assigned_at: new Date(),
      created_at: new Date(),
    });
}
```

### **9. `user_permission_overrides`**

#### **Create Permission Override**
```typescript
async function createPermissionOverride(data: {
  system_user_id: number;
  permission_id: number;
  override_type: string;
  is_allowed: boolean;
  override_reason: string;
  granted_by: number;
  valid_until?: Date;
}) {
  const db = getDb();
  await db.insert(userPermissionOverrides)
    .values({
      ...data,
      is_active: true,
      granted_at: new Date(),
      created_at: new Date(),
    });
}
```

---

## 📄 **ACCESS CONTROL TABLES**

### **10. `access_modules`**

#### **Create Module**
```typescript
async function createAccessModule(data: {
  module_id: string;
  module_name: string;
  module_display_name: string;
  module_type: string;
  parent_module_id?: number;
}) {
  const db = getDb();
  const [module] = await db.insert(accessModules)
    .values({
      ...data,
      is_active: true,
      created_at: new Date(),
    })
    .returning();
  return module;
}
```

### **11. `access_pages`**

#### **Create Page**
```typescript
async function createAccessPage(data: {
  page_id: string;
  module_id: number;
  page_name: string;
  route_path: string;
  required_permissions?: string[];
}) {
  const db = getDb();
  const [page] = await db.insert(accessPages)
    .values({
      ...data,
      is_active: true,
      created_at: new Date(),
    })
    .returning();
  return page;
}
```

---

## 📊 **ACTIVITY & AUDIT TABLES**

### **12. `system_audit_logs`**

#### **Log Audit Event**
```typescript
async function logAuditEvent(data: {
  system_user_id?: number;
  module_name: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  old_data?: any;
  new_data?: any;
  changed_fields?: string[];
  ip_address?: string;
}) {
  const db = getDb();
  await db.insert(systemAuditLogs)
    .values({
      ...data,
      created_at: new Date(),
    });
}
```

### **13. `access_activity_logs`**

#### **Log Access Activity**
```typescript
async function logAccessActivity(data: {
  system_user_id: number;
  access_type: string;
  page_name?: string;
  api_endpoint?: string;
  action_performed: string;
  ip_address?: string;
  session_id?: number;
}) {
  const db = getDb();
  await db.insert(accessActivityLogs)
    .values({
      ...data,
      created_at: new Date(),
    });
}
```

### **14. `permission_change_logs`**

#### **Log Permission Change**
```typescript
async function logPermissionChange(data: {
  target_user_id: number;
  change_type: string;
  role_id?: number;
  permission_id?: number;
  changed_by: number;
  access_before?: any;
  access_after?: any;
}) {
  const db = getDb();
  await db.insert(permissionChangeLogs)
    .values({
      ...data,
      created_at: new Date(),
    });
}
```

---

## 🔒 **ACCESS RESTRICTIONS**

### **15. `access_restrictions`**

#### **Create Restriction**
```typescript
async function createAccessRestriction(data: {
  system_user_id: number;
  restriction_type: string;
  allowed_days?: string[];
  allowed_time_start?: string;
  allowed_time_end?: string;
  allowed_ips?: string[];
  created_by: number;
}) {
  const db = getDb();
  await db.insert(accessRestrictions)
    .values({
      ...data,
      is_active: true,
      created_at: new Date(),
    });
}
```

---

## 📍 **SCOPE ASSIGNMENTS**

### **16. `area_assignments`**

#### **Assign Area to User**
```typescript
async function assignAreaToUser(data: {
  system_user_id: number;
  area_type: string;
  area_code: string;
  area_name: string;
  cities?: string[];
  assigned_by: number;
}) {
  const db = getDb();
  await db.insert(areaAssignments)
    .values({
      ...data,
      is_active: true,
      assigned_at: new Date(),
      created_at: new Date(),
    });
}
```

### **17. `service_scope_assignments`**

#### **Assign Service Scope**
```typescript
async function assignServiceScope(data: {
  system_user_id: number;
  service_type: string;
  access_level: string;
  assigned_by: number;
}) {
  const db = getDb();
  await db.insert(serviceScopeAssignments)
    .values({
      ...data,
      is_active: true,
      assigned_at: new Date(),
      created_at: new Date(),
    });
}
```

---

## 🎯 **DOMAIN-SPECIFIC ACCESS CONTROLS**

### **18. `order_access_controls`**

#### **Create/Update Order Access Control**
```typescript
async function upsertOrderAccessControl(systemUserId: number, data: {
  can_view_all_orders?: boolean;
  can_create_order?: boolean;
  // ... all other fields
}) {
  const db = getDb();
  const existing = await db.select()
    .from(orderAccessControls)
    .where(eq(orderAccessControls.system_user_id, systemUserId))
    .limit(1);
  
  if (existing.length > 0) {
    await db.update(orderAccessControls)
      .set({ ...data, updated_at: new Date() })
      .where(eq(orderAccessControls.system_user_id, systemUserId));
  } else {
    await db.insert(orderAccessControls)
      .values({
        system_user_id: systemUserId,
        ...data,
        created_at: new Date(),
      });
  }
}
```

**Similar pattern for all other `*_access_controls` tables:**
- `ticket_access_controls`
- `rider_management_access`
- `merchant_management_access`
- `customer_management_access`
- `payment_access_controls`
- `payout_access_controls`
- `refund_access_controls`
- `offer_management_access`
- `advertisement_management_access`

---

## 🔄 **HELPER FUNCTIONS**

### **Get User with All Related Data**
```typescript
async function getUserComplete(systemUserId: number) {
  const db = getDb();
  
  // Get user
  const user = await getSystemUserById(systemUserId);
  
  // Get roles
  const roles = await getUserRoles(systemUserId);
  
  // Get permissions
  const permissions = await getUserPermissions(systemUserId);
  
  // Get access controls
  const orderAccess = await getOrderAccessControl(systemUserId);
  const ticketAccess = await getTicketAccessControl(systemUserId);
  // ... all other access controls
  
  // Get assignments
  const areaAssignments = await getAreaAssignments(systemUserId);
  const serviceScopes = await getServiceScopeAssignments(systemUserId);
  
  // Get sessions
  const sessions = await getActiveSessions(systemUserId);
  
  // Get login history (last 10)
  const loginHistory = await getLoginHistory(systemUserId, 10);
  
  return {
    user,
    roles,
    permissions,
    accessControls: {
      orders: orderAccess,
      tickets: ticketAccess,
      // ... all others
    },
    assignments: {
      areas: areaAssignments,
      services: serviceScopes,
    },
    sessions,
    loginHistory,
  };
}
```

---

## 📝 **TRANSACTION PATTERNS**

### **Create User with Auth**
```typescript
async function createUserWithAuth(userData: any, passwordHash: string) {
  const db = getDb();
  
  return await db.transaction(async (tx) => {
    // 1. Create user
    const [user] = await tx.insert(systemUsers)
      .values(userData)
      .returning();
    
    // 2. Create auth
    await tx.insert(systemUserAuth)
      .values({
        system_user_id: user.id,
        password_hash: passwordHash,
      });
    
    // 3. Log audit
    await tx.insert(systemAuditLogs)
      .values({
        system_user_id: user.id,
        module_name: 'USERS',
        action_type: 'CREATE',
        entity_type: 'USER',
        entity_id: user.id.toString(),
      });
    
    return user;
  });
}
```

---

## 🔍 **QUERY OPTIMIZATION**

### **Indexes to Ensure**
- `system_users.email` - UNIQUE index
- `system_users.system_user_id` - UNIQUE index
- `system_user_sessions.system_user_id` + `is_active`
- `user_roles.system_user_id` + `is_active`
- `role_permissions.role_id` + `is_active`
- All foreign keys

---

## ✅ **IMPLEMENTATION CHECKLIST**

- [ ] Implement all CRUD operations for 46 tables
- [ ] Add transaction support for complex operations
- [ ] Add proper error handling
- [ ] Add input validation
- [ ] Add query optimization
- [ ] Add audit logging for all changes
- [ ] Add permission checks before operations
