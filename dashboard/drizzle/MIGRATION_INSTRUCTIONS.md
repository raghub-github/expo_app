# Dashboard Access Control Migration Instructions

## Overview

This migration creates 3 critical tables for dashboard access control:
1. `dashboard_access` - Dashboard-level access control
2. `dashboard_access_points` - Action-level permissions
3. `action_audit_log` - Complete action tracking

## Migration File

**File**: `0042_dashboard_access_control.sql`

## Execution Methods

### Option 1: Supabase SQL Editor (Recommended)

1. Open your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy the entire contents of `dashboard/drizzle/0042_dashboard_access_control.sql`
5. Paste into the SQL Editor
6. Click **Run** or press `Ctrl+Enter`
7. Wait for success message ✅

**Verification Query**:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('dashboard_access', 'dashboard_access_points', 'action_audit_log')
ORDER BY table_name;
```

Expected result: 3 rows

### Option 2: Command Line (psql)

```bash
# Set your database URL
export DATABASE_URL="postgresql://user:password@host:port/database"

# Navigate to dashboard directory
cd dashboard

# Run migration
psql $DATABASE_URL -f drizzle/0042_dashboard_access_control.sql
```

### Option 3: Node.js Script

```bash
# Navigate to dashboard directory
cd dashboard

# Set database URL
export DATABASE_URL="postgresql://user:password@host:port/database"

# Run migration script
npx tsx scripts/run-migration.ts
```

### Option 4: Verify Migration

After running the migration, verify it worked:

```bash
npx tsx scripts/verify-migration.ts
```

## What This Migration Creates

### 1. `dashboard_access` Table
- Stores which dashboards each user can access
- Columns: `id`, `system_user_id`, `dashboard_type`, `access_level`, `is_active`, etc.
- Indexes: `dashboard_access_user_id_idx`, `dashboard_access_dashboard_type_idx`, `dashboard_access_is_active_idx`

### 2. `dashboard_access_points` Table
- Stores grouped access points (actions) within each dashboard
- Columns: `id`, `system_user_id`, `dashboard_type`, `access_point_group`, `allowed_actions` (JSONB), `context` (JSONB), etc.
- Indexes: Multiple indexes for performance

### 3. `action_audit_log` Table
- Tracks ALL actions performed by agents
- Columns: `id`, `agent_id`, `agent_email`, `dashboard_type`, `action_type`, `action_details` (JSONB), etc.
- Indexes: Multiple indexes for query performance

## Troubleshooting

### Error: "relation does not exist"
- **Cause**: Migration hasn't been run yet
- **Solution**: Run the migration using one of the methods above

### Error: "relation already exists"
- **Cause**: Migration was already run
- **Solution**: This is OK - the migration uses `CREATE TABLE IF NOT EXISTS`

### Error: "permission denied"
- **Cause**: Database user doesn't have CREATE TABLE permissions
- **Solution**: Use a user with superuser or appropriate permissions

### Error: "column does not exist"
- **Cause**: Migration partially failed or schema mismatch
- **Solution**: 
  1. Check if tables exist: `SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'dashboard%';`
  2. If tables exist but columns are missing, drop and re-run migration
  3. If no tables exist, run migration again

## Post-Migration Verification

Run these queries to verify everything is set up correctly:

```sql
-- Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('dashboard_access', 'dashboard_access_points', 'action_audit_log');

-- Check indexes exist
SELECT indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND (indexname LIKE 'dashboard_access%' OR indexname LIKE 'action_audit_log%');

-- Test insert (will be rolled back)
BEGIN;
INSERT INTO dashboard_access (system_user_id, dashboard_type, access_level, granted_by)
VALUES (999999, 'TEST', 'VIEW_ONLY', 1);
ROLLBACK;
```

## Next Steps

After migration is complete:

1. ✅ Verify tables exist using verification script
2. ✅ Test user creation with dashboard access
3. ✅ Test access point assignment
4. ✅ Verify actions are logged to audit log

## Support

If you encounter issues:
1. Check the error message carefully
2. Verify your database connection string is correct
3. Ensure you have proper database permissions
4. Check Supabase logs if using Supabase
