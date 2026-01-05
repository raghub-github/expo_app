# Enum Value Fixes

## Issue
PostgreSQL enums have specific allowed values. Using invalid enum values in index predicates causes errors:
```
ERROR: 22P02: invalid input value for enum order_status_type: "pending"
```

## Root Cause
The `order_status_type` enum does NOT have 'pending' as a value. It only has:
- 'assigned'
- 'accepted'
- 'reached_store'
- 'picked_up'
- 'in_transit'
- 'delivered'
- 'cancelled'
- 'failed'

## Fixed Index

### `0022_critical_indexes_part1.sql` (Line 102)

**Before:**
```sql
CREATE INDEX IF NOT EXISTS orders_pending_orders_idx ON orders(status, created_at) 
  WHERE status IN ('assigned', 'pending');
```

**After:**
```sql
-- Note: order_status_type enum doesn't have 'pending', only: assigned, accepted, reached_store, picked_up, in_transit, delivered, cancelled, failed
CREATE INDEX IF NOT EXISTS orders_pending_orders_idx ON orders(status, created_at) 
  WHERE status IN ('assigned');
```

## Valid Status Types

### ✅ Valid - These are correct:

1. **`order_assignments.status`** (TEXT type)
   - Values: 'pending', 'accepted', 'rejected', 'timeout', 'cancelled'
   - ✅ Line 130, 132 in 0022: `WHERE status = 'pending'` - CORRECT

2. **`order_rider_assignments.assignment_status`** (`rider_assignment_status` enum)
   - Values: 'pending', 'assigned', 'accepted', 'rejected', 'cancelled', 'completed', 'failed'
   - ✅ Line 142, 146 in 0022: `WHERE assignment_status IN ('pending', 'assigned', 'accepted')` - CORRECT

3. **`order_payments.payment_status`** (`payment_status_type` enum)
   - Values: 'pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded', 'cancelled'
   - ✅ Line 66 in 0023: `WHERE payment_status IN ('pending', 'processing')` - CORRECT

4. **`order_refunds.refund_status`** (TEXT type)
   - Values: 'pending', 'processing', 'completed', 'failed'
   - ✅ Line 79 in 0023: `WHERE refund_status = 'pending'` - CORRECT

5. **`withdrawal_requests.status`** (`withdrawal_status` enum)
   - Values: 'pending', 'processing', 'completed', 'failed', 'cancelled'
   - ✅ Line 29, 40 in 0026: `WHERE status = 'pending'` - CORRECT

6. **`webhook_events.status`** (`webhook_event_status` enum)
   - Values: 'pending', 'processing', 'processed', 'failed', 'ignored'
   - ✅ Line 71, 122 in 0027: `WHERE status IN ('pending', 'processing')` - CORRECT

### ❌ Invalid - Fixed:

1. **`orders.status`** (`order_status_type` enum)
   - ❌ Does NOT have 'pending'
   - ✅ FIXED: Removed 'pending' from index predicate

## Summary

**Total Issues Found:** 1  
**Total Issues Fixed:** 1  
**Files Modified:** 1 (0022_critical_indexes_part1.sql)

All other status-related indexes use correct enum values or TEXT types where 'pending' is valid.

## Verification

All enum values in index predicates have been verified against their type definitions:
- ✅ `order_status_type` - Fixed
- ✅ `rider_assignment_status` - Valid
- ✅ `payment_status_type` - Valid
- ✅ `withdrawal_status` - Valid
- ✅ `webhook_event_status` - Valid
- ✅ TEXT columns - Valid (can use any string value)

No other enum value errors should occur.
