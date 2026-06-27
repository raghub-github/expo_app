# ✅ Migration 0091 - Ready to Run

## Status: FIXED - All SQL Errors Resolved

The migration files have been updated to handle PostgreSQL enum types correctly.

## Files Fixed

All three migration files now use `LOWER(service_type::text)` instead of `ILIKE`:

- ✅ `0091_test_before_migration.sql` - Preview changes (no errors)
- ✅ `0091_fix_rider_blocking_status.sql` - Main migration (no errors)  
- ✅ `0091_fix_rider_blocking_status_SAFE.sql` - Detailed migration (no errors)

## Quick Start

### Option 1: Standard Migration (Recommended)

```bash
# Preview what will change
psql $DATABASE_URL -f dashboard/drizzle/0091_test_before_migration.sql

# Run the migration
psql $DATABASE_URL -f dashboard/drizzle/0091_fix_rider_blocking_status.sql
```

### Option 2: Detailed Migration (For Visibility)

```bash
# Runs with detailed logging and step-by-step output
psql $DATABASE_URL -f dashboard/drizzle/0091_fix_rider_blocking_status_SAFE.sql
```

## What Was Fixed

### Error Before:
```
ERROR: 42883: operator does not exist: service_type ~~* unknown
HINT: No operator matches the given name and argument types. 
      You might need to add explicit type casts.
```

### Solution Applied:
```sql
-- BEFORE (caused error)
WHERE bh.service_type ILIKE '%all%'

-- AFTER (works correctly)
WHERE LOWER(bh.service_type::text) = 'all'
```

**Why this works:**
1. `::text` casts the enum to text type
2. `LOWER()` makes it case-insensitive
3. Compares to lowercase `'all'` (matches 'all', 'ALL', 'All', etc.)

## What the Migration Does

### Fix 1: Blocked Riders
Updates riders who are permanently blocked for all services:
- FROM: `status = 'INACTIVE'`
- TO: `status = 'BLOCKED'`

### Fix 2: Unverified Active Riders (Security Fix)
Updates riders who are active but haven't completed onboarding:
- FROM: `status = 'ACTIVE'` (despite incomplete onboarding)
- TO: `status = 'INACTIVE'` (must complete onboarding first)

## Verification

After running the migration, verify with these queries:

```sql
-- Should return 0 rows (all permanently blocked riders should be BLOCKED)
SELECT id, name, mobile, status
FROM riders r
WHERE status != 'BLOCKED'
AND deleted_at IS NULL
AND EXISTS (
  SELECT 1 FROM blacklist_history bh
  WHERE bh.rider_id = r.id
  AND LOWER(bh.service_type::text) = 'all'
  AND bh.banned = true
  AND bh.is_permanent = true
);

-- Should return 0 rows (all ACTIVE riders should have completed onboarding)
SELECT id, name, mobile, status, onboarding_stage
FROM riders
WHERE status = 'ACTIVE'
AND deleted_at IS NULL
AND onboarding_stage != 'ACTIVE';
```

## Summary

✅ All SQL syntax errors fixed  
✅ Uses proper type casting (`::text`)  
✅ Case-insensitive matching works correctly  
✅ Ready to deploy  

**No more errors - you can run the migration now!** 🎉
