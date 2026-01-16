# Dashboard Access Control - Quick Reference

## 🚨 FIRST: Run Migration

**Before anything works, you MUST run the migration:**

```bash
# Option 1: Supabase SQL Editor (Recommended)
# Copy/paste contents of dashboard/drizzle/0042_dashboard_access_control.sql

# Option 2: Command line
cd dashboard
psql $DATABASE_URL -f drizzle/0042_dashboard_access_control.sql

# Option 3: Script
npm run migrate
npm run verify-migration
```

## 📊 Tables Overview

| Table | Purpose | Controls |
|-------|---------|----------|
| `dashboard_access` | Dashboard visibility | Which dashboards user can see |
| `dashboard_access_points` | Action permissions | What actions user can perform |
| `action_audit_log` | Action history | Complete audit trail |

## 🎯 ORDER Dashboard - 3 Access Groups

| Group | Actions | Purpose |
|-------|---------|---------|
| `ORDER_VIEW` | VIEW | View order details only |
| `ORDER_CANCEL_ASSIGN` | UPDATE, CANCEL, ASSIGN | Cancel ride, assign rider, add remark |
| `ORDER_REFUND_DELIVER` | CANCEL, REFUND, UPDATE | Refund orders, update deliver status |

## 🔧 Super Admin Workflow

### Create User with Access:
1. `/dashboard/users/new`
2. Fill user details
3. Select dashboards
4. Select access points per dashboard
5. Save

### Update User Access:
1. `/dashboard/users/[id]`
2. Click "Manage Dashboard Access"
3. Modify selections
4. Save

### View All Actions:
1. `/dashboard/audit`
2. Filter as needed
3. Export if needed

## 💻 Code Examples

### Check Permission Before Action:
```typescript
import { canRefundOrder } from "@/lib/permissions/actions";

const canRefund = await canRefundOrder(session.user.id, session.user.email!);
if (!canRefund) {
  return NextResponse.json({ error: "No permission" }, { status: 403 });
}
```

### Log Action:
```typescript
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";

await logActionByAuth(
  session.user.id,
  session.user.email!,
  "ORDER",
  "REFUND",
  {
    resourceType: "ORDER",
    resourceId: orderId,
    actionDetails: { amount: 100 },
    ipAddress: getIpAddress(request),
    userAgent: getUserAgent(request),
    requestPath: request.nextUrl.pathname,
    requestMethod: "POST",
  }
);
```

### Protect Page:
```typescript
import { requireDashboardAccess } from "@/lib/permissions/page-protection";

export default async function OrdersPage() {
  await requireDashboardAccess("ORDER");
  // Page content...
}
```

## ✅ Verification Checklist

- [ ] Migration run successfully
- [ ] All 3 tables exist
- [ ] Can create user with access
- [ ] ORDER shows 3 access point groups
- [ ] Actions are logged to audit log
- [ ] Super admin sees all dashboards
- [ ] Regular user only sees assigned dashboards

## 🆘 Troubleshooting

**Error: "relation dashboard_access does not exist"**
→ Run migration

**User sees no dashboards**
→ Grant dashboard access via user management

**Access points not appearing**
→ Check `DashboardAccessSelector` definitions

**Actions not logged**
→ Ensure `logActionByAuth()` is called
