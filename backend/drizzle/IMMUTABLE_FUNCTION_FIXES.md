# IMMUTABLE Function Fixes

## Issue
PostgreSQL requires that functions used in **index predicates** (WHERE clauses in CREATE INDEX) must be marked as IMMUTABLE. Functions like `NOW()`, `CURRENT_DATE`, `CURRENT_TIMESTAMP` are NOT immutable because they return different values each time they're called.

## Error Message
```
ERROR: 42P17: functions in index predicate must be marked IMMUTABLE
```

## Fixed Indexes

### 1. `0022_critical_indexes_part1.sql` (Line 65)
**Before:**
```sql
CREATE INDEX ... WHERE created_at > NOW() - INTERVAL '1 hour';
```

**After:**
```sql
-- Note: Cannot use NOW() in index predicate (not IMMUTABLE)
-- Application should filter by time when querying recent location logs
CREATE INDEX ... ON location_logs(rider_id, created_at DESC);
```

### 2. `0024_critical_indexes_part3.sql` (Line 110)
**Before:**
```sql
CREATE INDEX ... WHERE status = 'ACTIVE' AND valid_till > NOW();
```

**After:**
```sql
-- Note: Cannot use NOW() in index predicate (not IMMUTABLE)
-- Index on status and valid_till - application should filter by current date
CREATE INDEX ... WHERE status = 'ACTIVE';
```

### 3. `0025_critical_indexes_part4.sql` (Line 125)
**Before:**
```sql
CREATE INDEX ... WHERE is_active = TRUE AND valid_till > NOW();
```

**After:**
```sql
-- Note: Cannot use NOW() in index predicate (not IMMUTABLE)
-- Index on is_active and valid_till - application should filter by current date
CREATE INDEX ... WHERE is_active = TRUE;
```

### 4. `0027_critical_indexes_part6.sql` (Line 225)
**Before:**
```sql
CREATE INDEX ... WHERE active = TRUE AND end_date > NOW();
```

**After:**
```sql
-- Note: Cannot use NOW() in index predicate (not IMMUTABLE)
-- Index on active and dates - application should filter by current date
CREATE INDEX ... WHERE active = TRUE;
```

## Solution

Instead of filtering by `NOW()` in the index predicate, we:
1. **Removed the time-based condition** from the index
2. **Kept the boolean/status conditions** (these are immutable)
3. **Added comments** explaining why and what the application should do

## Application-Level Filtering

The application should add the time-based filter in the WHERE clause of queries:

```sql
-- Example: Get active customer coupons
SELECT * FROM customer_coupons 
WHERE status = 'ACTIVE' 
  AND valid_till > NOW()  -- Application adds this filter
ORDER BY valid_till;
```

The index will still help with the `status = 'ACTIVE'` part, and PostgreSQL will filter by date at query time.

## Why This Works

- **Indexes are for structure**: They help find rows quickly based on immutable conditions
- **Queries handle time**: The application adds time-based filters in WHERE clauses
- **Performance**: Still fast because the index narrows down the result set before date filtering

## Verification

All files have been checked and fixed. No other IMMUTABLE function errors should occur.

## Files Verified
- ✅ 0022_critical_indexes_part1.sql
- ✅ 0023_critical_indexes_part2.sql
- ✅ 0024_critical_indexes_part3.sql
- ✅ 0025_critical_indexes_part4.sql
- ✅ 0026_critical_indexes_part5.sql
- ✅ 0027_critical_indexes_part6.sql
- ✅ 0028_triggers_and_functions.sql (NOW() usage is fine - inside functions, not index predicates)
- ✅ 0029_constraints_and_validations.sql
- ✅ 0030_materialized_views.sql
