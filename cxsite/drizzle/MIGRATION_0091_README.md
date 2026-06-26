# Migration 0091: Fix Rider Blocking Status

## Problem Encountered

When running the initial migration, we encountered PostgreSQL errors:

```
ERROR: 42883: operator does not exist: service_type ~~* unknown
HINT: No operator matches the given name and argument types. You might need to add explicit type casts.
```

This error occurred because the `service_type` column is stored as a PostgreSQL **enum or custom type**, not plain `text`. The `ILIKE` operator doesn't work directly on enum types.

## Solution

Changed from:
```sql
WHERE bh.service_type ILIKE '%all%'  -- ❌ Doesn't work with enum types
```

To:
```sql
WHERE LOWER(bh.service_type::text) = 'all'  -- ✅ Works with enum types
```

The `::text` cast converts the enum to text, then `LOWER()` makes it case-insensitive.

## Files Available

### 1. **Main Migration** (Recommended)
**File:** `0091_fix_rider_blocking_status.sql`

Simple, clean migration that:
- Fixes riders who should be `BLOCKED` but are `INACTIVE`
- Fixes riders who are `ACTIVE` but haven't completed onboarding
- Includes verification queries as comments

**Run this:**
```bash
psql $DATABASE_URL -f dashboard/drizzle/0091_fix_rider_blocking_status.sql
```

### 2. **Test Script** (Run First!)
**File:** `0091_test_before_migration.sql`

Shows you exactly what will change:
- Lists all `service_type` values in your database
- Counts how many riders will be affected
- Shows the first 10 riders that will change in each category
- Provides a summary

**Run this first to preview changes:**
```bash
psql $DATABASE_URL -f dashboard/drizzle/0091_test_before_migration.sql
```

### 3. **Detailed Migration** (For troubleshooting)
**File:** `0091_fix_rider_blocking_status_SAFE.sql`

Verbose version with:
- Step-by-step execution with notices
- DRY RUN preview before each change
- Detailed verification after each step

**Use if you want maximum visibility:**
```bash
psql $DATABASE_URL -f dashboard/drizzle/0091_fix_rider_blocking_status_SAFE.sql
```

## Recommended Steps

### Step 1: Test First (Preview)
```bash
psql $DATABASE_URL -f dashboard/drizzle/0091_test_before_migration.sql
```

Review the output to see:
- How many riders will change status
- Which specific riders will be affected
- Current status distribution

### Step 2: Run Migration
```bash
psql $DATABASE_URL -f dashboard/drizzle/0091_fix_rider_blocking_status.sql
```

### Step 3: Verify (Optional)
After migration, you can run the commented verification queries in the migration file:

```sql
-- Check that all permanently blocked riders have status = BLOCKED
SELECT r.id, r.name, r.mobile, r.status, r.onboarding_stage
FROM riders r
JOIN blacklist_history bh ON bh.rider_id = r.id
WHERE LOWER(bh.service_type::text) = 'all'
AND bh.banned = true
AND bh.is_permanent = true
AND r.deleted_at IS NULL
AND NOT EXISTS (
  SELECT 1 FROM blacklist_history bh2
  WHERE bh2.rider_id = r.id
  AND LOWER(bh2.service_type::text) = 'all'
  AND bh2.banned = false
  AND bh2.created_at > bh.created_at
)
AND r.status != 'BLOCKED';
-- Should return 0 rows
```

```sql
-- Check that all ACTIVE riders have completed onboarding
SELECT id, name, mobile, status, onboarding_stage
FROM riders
WHERE status = 'ACTIVE'
AND deleted_at IS NULL
AND onboarding_stage != 'ACTIVE';
-- Should return 0 rows
```

## What Gets Fixed

### Fix 1: Blocked Riders
**Before:** `status = 'INACTIVE'` (when permanently blocked for all services)  
**After:** `status = 'BLOCKED'`

**Logic:**
- Rider has a permanent blacklist record for "all" services
- No more recent whitelist exists
- Status will be updated from `INACTIVE` to `BLOCKED`

### Fix 2: Unverified Active Riders
**Before:** `status = 'ACTIVE'` (even though `onboarding_stage != 'ACTIVE'`)  
**After:** `status = 'INACTIVE'`

**Logic:**
- Rider has `status = 'ACTIVE'`
- But `onboarding_stage != 'ACTIVE'` (onboarding not complete)
- Status will be updated to `INACTIVE` (must complete onboarding first)

## Safety Features

- Only affects non-deleted riders (`deleted_at IS NULL`)
- Uses explicit type casting (`::text`) for compatibility
- Case-insensitive matching (`LOWER()`) for both 'all' and 'ALL'
- Updates `updated_at` timestamp automatically
- Includes verification queries to check results

## Rollback (If Needed)

If you need to undo the migration for some reason:

```sql
-- This is NOT recommended, but if absolutely necessary:
-- You would need to manually review each rider and determine their correct status
-- There is no automatic rollback for this migration

-- To see what changed, check the updated_at timestamp:
SELECT id, name, mobile, status, onboarding_stage, updated_at
FROM riders
WHERE updated_at > '2026-02-08'  -- Replace with migration run time
ORDER BY updated_at DESC;
```

## Support

If you encounter any issues:

1. Check the error message for the exact line number
2. Run the test script first to preview changes
3. Use the SAFE version for detailed step-by-step execution
4. Review the main bug fix documentation in `RIDER_BLOCKING_BUG_FIX.md`
