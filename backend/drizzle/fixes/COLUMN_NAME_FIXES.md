# Column Name Fixes

## Issue
Indexes were created referencing columns that don't exist in the actual table structure.

## Error Message
```
ERROR: 42703: column "raised_by_type" does not exist
```

## Fixed Indexes

### 1. `0023_critical_indexes_part2.sql` (Line 133)

**Table:** `order_disputes`

**Before:**
```sql
CREATE INDEX ... ON order_disputes(raised_by_type, raised_by_id);
```

**After:**
```sql
-- Note: order_disputes table has 'raised_by' (TEXT), not 'raised_by_type'
CREATE INDEX ... ON order_disputes(raised_by, raised_by_id);
```

**Reason:** The `order_disputes` table has:
- `raised_by` (TEXT) - NOT `raised_by_type`
- `raised_by_id` (BIGINT)

## Column Name Reference

### ✅ Correct Column Names:

1. **`order_disputes`**
   - ✅ `raised_by` (TEXT) - NOT `raised_by_type`
   - ✅ `raised_by_id` (BIGINT)
   - ✅ `disputed_against` (TEXT) - NOT `disputed_against_type`

2. **`unified_tickets`**
   - ✅ `raised_by_type` (unified_ticket_source enum) - CORRECT
   - ✅ `raised_by_id` (BIGINT)

3. **`order_remarks`**
   - ✅ `actor_type` (TEXT) - CORRECT
   - ✅ `actor_id` (BIGINT)

4. **`order_notifications`**
   - ✅ `recipient_type` (TEXT) - CORRECT
   - ✅ `recipient_id` (BIGINT)

5. **`order_audit_log`**
   - ✅ `actor_type` (TEXT) - CORRECT
   - ✅ `actor_id` (BIGINT)

## Verification Checklist

All index files have been checked for:
- ✅ Column names match actual table structure
- ✅ Enum values match enum definitions
- ✅ No non-existent columns referenced

## Summary

**Total Issues Found:** 1  
**Total Issues Fixed:** 1  
**Files Modified:** 1 (0023_critical_indexes_part2.sql)

All column references are now correct and match the actual table structures.
