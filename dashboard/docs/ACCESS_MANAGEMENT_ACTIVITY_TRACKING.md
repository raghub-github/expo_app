# Activity Tracking & Monitoring System

## 📊 **ACTIVITY TRACKING OVERVIEW**

Every user action must be tracked for:
- Security monitoring
- Audit compliance
- Activity analysis
- Debugging
- User behavior insights

---

## 🔍 **WHAT TO TRACK**

### **1. User Actions**
- Page visits
- Button clicks
- Form submissions
- Data exports
- Settings changes
- Permission changes

### **2. System Events**
- User creation/update/deletion
- Role assignment
- Permission changes
- Access control updates
- Session creation/revocation
- Login/logout events

### **3. Data Changes**
- Field-level changes
- Before/after values
- Changed by user
- Change timestamp
- Change reason

---

## 🛠️ **IMPLEMENTATION**

### **Activity Tracker Service**

**File**: `lib/auth/activity-tracker.ts`

```typescript
interface ActivityLog {
  system_user_id: number;
  access_type: string;
  page_name?: string;
  api_endpoint?: string;
  http_method?: string;
  action_performed: string;
  action_result: string;
  ip_address?: string;
  device_info?: string;
  session_id?: number;
  request_params?: any;
  response_data?: any;
}

export async function logActivity(data: ActivityLog) {
  const db = getDb();
  
  await db.insert(accessActivityLogs)
    .values({
      ...data,
      created_at: new Date(),
    });
}

export async function logPageVisit(
  userId: number,
  pagePath: string,
  sessionId?: number
) {
  await logActivity({
    system_user_id: userId,
    access_type: 'PAGE_VISIT',
    page_name: pagePath,
    action_performed: 'VIEW',
    action_result: 'SUCCESS',
    session_id: sessionId,
  });
}

export async function logAPICall(
  userId: number,
  endpoint: string,
  method: string,
  success: boolean,
  params?: any
) {
  await logActivity({
    system_user_id: userId,
    access_type: 'API_CALL',
    api_endpoint: endpoint,
    http_method: method,
    action_performed: method,
    action_result: success ? 'SUCCESS' : 'FAILED',
    request_params: params,
  });
}
```

---

## 📝 **AUDIT LOGGING**

### **Audit Logger Service**

**File**: `lib/audit/audit-logger.ts`

```typescript
interface AuditLog {
  system_user_id?: number;
  module_name: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  old_data?: any;
  new_data?: any;
  changed_fields?: string[];
}

export async function logAuditEvent(data: AuditLog) {
  const db = getDb();
  
  // Get user info
  const user = data.system_user_id 
    ? await getSystemUserById(data.system_user_id)
    : null;
  
  await db.insert(systemAuditLogs)
    .values({
      ...data,
      system_user_name: user?.full_name,
      role_at_time: user?.primary_role,
      created_at: new Date(),
    });
}

export async function logUserCreation(
  userId: number,
  createdUserId: number,
  userData: any
) {
  await logAuditEvent({
    system_user_id: userId,
    module_name: 'USERS',
    action_type: 'CREATE',
    entity_type: 'USER',
    entity_id: createdUserId.toString(),
    new_data: userData,
  });
}

export async function logUserUpdate(
  userId: number,
  updatedUserId: number,
  oldData: any,
  newData: any,
  changedFields: string[]
) {
  await logAuditEvent({
    system_user_id: userId,
    module_name: 'USERS',
    action_type: 'UPDATE',
    entity_type: 'USER',
    entity_id: updatedUserId.toString(),
    old_data: oldData,
    new_data: newData,
    changed_fields: changedFields,
  });
}
```

---

## 🔐 **PERMISSION CHANGE LOGGING**

### **Permission Change Logger**

**File**: `lib/audit/permission-change-logger.ts`

```typescript
export async function logPermissionChange(data: {
  target_user_id: number;
  change_type: 'GRANTED' | 'REVOKED';
  role_id?: number;
  permission_id?: number;
  changed_by: number;
  access_before: any;
  access_after: any;
}) {
  const db = getDb();
  
  const targetUser = await getSystemUserById(data.target_user_id);
  const changedByUser = await getSystemUserById(data.changed_by);
  
  await db.insert(permissionChangeLogs)
    .values({
      target_user_id: data.target_user_id,
      target_user_name: targetUser?.full_name,
      change_type: data.change_type,
      role_id: data.role_id,
      permission_id: data.permission_id,
      changed_by: data.changed_by,
      changed_by_name: changedByUser?.full_name,
      access_before: data.access_before,
      access_after: data.access_after,
      created_at: new Date(),
    });
}
```

---

## 🚨 **SECURITY EVENT MONITORING**

### **Security Monitor**

**File**: `lib/audit/security-monitor.ts`

```typescript
export async function logSecurityEvent(data: {
  event_type: string;
  event_severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  event_description: string;
  system_user_id?: number;
  ip_address?: string;
  target_resource?: string;
  attempted_action?: string;
}) {
  const db = getDb();
  
  await db.insert(securityEvents)
    .values({
      ...data,
      is_resolved: false,
      created_at: new Date(),
    });
}

// Auto-detect suspicious activities
export async function detectSuspiciousActivity(
  userId: number,
  action: string,
  context: any
) {
  // Check for:
  // - Multiple failed login attempts
  // - Unusual access patterns
  // - Permission escalation attempts
  // - Unauthorized access attempts
  
  const suspicious = await checkSuspiciousPatterns(userId, action, context);
  
  if (suspicious) {
    await logSecurityEvent({
      event_type: 'SUSPICIOUS_ACTIVITY',
      event_severity: 'HIGH',
      event_description: `Suspicious activity detected: ${action}`,
      system_user_id: userId,
      target_resource: context.resource,
      attempted_action: action,
    });
  }
}
```

---

## 📊 **REAL-TIME ACTIVITY FEED**

### **Activity Feed Component**

**File**: `components/activity/ActivityFeed.tsx`

```typescript
export function ActivityFeed() {
  const [activities, setActivities] = useState([]);
  const [filters, setFilters] = useState({});
  
  useEffect(() => {
    // Poll for new activities
    const interval = setInterval(async () => {
      const response = await fetch('/api/activity?' + new URLSearchParams(filters));
      const data = await response.json();
      setActivities(data.activities);
    }, 5000); // Poll every 5 seconds
    
    return () => clearInterval(interval);
  }, [filters]);
  
  return (
    <div className="space-y-4">
      <ActivityFilters onFilterChange={setFilters} />
      <div className="space-y-2">
        {activities.map(activity => (
          <ActivityItem key={activity.id} activity={activity} />
        ))}
      </div>
    </div>
  );
}
```

---

## 🔄 **MIDDLEWARE INTEGRATION**

### **Update Middleware for Activity Tracking**

**File**: `middleware.ts` (update existing)

```typescript
import { logPageVisit, logAPICall } from '@/lib/auth/activity-tracker';

export async function middleware(request: NextRequest) {
  // ... existing auth checks ...
  
  if (session) {
    // Log page visit
    await logPageVisit(
      systemUserId,
      request.nextUrl.pathname,
      sessionId
    );
    
    // Log API calls
    if (request.nextUrl.pathname.startsWith('/api/')) {
      await logAPICall(
        systemUserId,
        request.nextUrl.pathname,
        request.method,
        true
      );
    }
  }
  
  // ... rest of middleware ...
}
```

---

## 📈 **ANALYTICS & REPORTING**

### **Activity Analytics**

**File**: `lib/analytics/activity-analytics.ts`

```typescript
export async function getUserActivityStats(userId: number, dateRange: { start: Date, end: Date }) {
  const db = getDb();
  
  // Get activity count
  const activities = await db.select()
    .from(accessActivityLogs)
    .where(
      and(
        eq(accessActivityLogs.system_user_id, userId),
        gte(accessActivityLogs.created_at, dateRange.start),
        lte(accessActivityLogs.created_at, dateRange.end)
      )
    );
  
  // Group by action type
  const stats = activities.reduce((acc, activity) => {
    acc[activity.action_performed] = (acc[activity.action_performed] || 0) + 1;
    return acc;
  }, {});
  
  return {
    totalActivities: activities.length,
    byAction: stats,
    mostActivePage: getMostActivePage(activities),
    averageResponseTime: getAverageResponseTime(activities),
  };
}
```

---

## ✅ **IMPLEMENTATION CHECKLIST**

- [ ] Create activity-tracker.ts service
- [ ] Create audit-logger.ts service
- [ ] Create permission-change-logger.ts
- [ ] Create security-monitor.ts
- [ ] Integrate with middleware
- [ ] Add activity tracking to all API routes
- [ ] Add activity tracking to all UI actions
- [ ] Build ActivityFeed component
- [ ] Build real-time updates
- [ ] Add analytics functions
- [ ] Add reporting features

---

## 🎯 **TRACKING COVERAGE**

### **Must Track**:
- ✅ All user actions (create, update, delete)
- ✅ All permission changes
- ✅ All role assignments
- ✅ All page visits
- ✅ All API calls
- ✅ All session events
- ✅ All security events
- ✅ All access control changes

### **Track Details**:
- Who (user ID, name)
- What (action type)
- When (timestamp)
- Where (IP, device, location)
- Why (reason if applicable)
- Result (success/failure)
- Changes (old vs new values)
