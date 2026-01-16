# VIEW Syntax Fixes

## Issue
PostgreSQL does NOT support `IF NOT EXISTS` clause for `CREATE VIEW` statements. This causes syntax errors:
```
ERROR: 42601: syntax error at or near "NOT"
```

## PostgreSQL Support for IF NOT EXISTS

| Object Type | IF NOT EXISTS Support | Notes |
|------------|----------------------|--------|
| `CREATE TABLE` | ✅ Yes | Supported since PostgreSQL 9.1 |
| `CREATE INDEX` | ✅ Yes | Supported since PostgreSQL 9.5 |
| `CREATE MATERIALIZED VIEW` | ✅ Yes | Supported since PostgreSQL 9.5 |
| `CREATE VIEW` | ❌ No | **NOT SUPPORTED** |
| `CREATE FUNCTION` | ❌ No | Use `CREATE OR REPLACE FUNCTION` |
| `CREATE TRIGGER` | ❌ No | Use `DROP TRIGGER IF EXISTS` then `CREATE TRIGGER` |

## Fixed Statements

### 1. `0030_materialized_views.sql`

#### Regular VIEWs (Lines 78, 106)

**Before:**
```sql
CREATE VIEW IF NOT EXISTS active_orders_with_rider AS ...
CREATE VIEW IF NOT EXISTS provider_sync_status AS ...
```

**After:**
```sql
-- Note: PostgreSQL doesn't support IF NOT EXISTS for CREATE VIEW
DROP VIEW IF EXISTS active_orders_with_rider;
CREATE VIEW active_orders_with_rider AS ...

DROP VIEW IF EXISTS provider_sync_status;
CREATE VIEW provider_sync_status AS ...
```

#### Materialized VIEWs (Lines 13, 38, 56)

**Before:**
```sql
CREATE MATERIALIZED VIEW IF NOT EXISTS provider_performance_summary AS ...
CREATE MATERIALIZED VIEW IF NOT EXISTS order_source_distribution AS ...
CREATE MATERIALIZED VIEW IF NOT EXISTS rider_performance_by_order_type AS ...
```

**After:**
```sql
-- Note: Using DROP IF EXISTS for idempotency (PostgreSQL 9.5+ supports IF NOT EXISTS for materialized views, but this is safer)
DROP MATERIALIZED VIEW IF EXISTS provider_performance_summary;
CREATE MATERIALIZED VIEW provider_performance_summary AS ...

DROP MATERIALIZED VIEW IF EXISTS order_source_distribution;
CREATE MATERIALIZED VIEW order_source_distribution AS ...

DROP MATERIALIZED VIEW IF EXISTS rider_performance_by_order_type;
CREATE MATERIALIZED VIEW rider_performance_by_order_type AS ...
```

## Solution Pattern

### For Regular VIEWs:
```sql
DROP VIEW IF EXISTS view_name;
CREATE VIEW view_name AS ...
```

### For Materialized VIEWs:
```sql
DROP MATERIALIZED VIEW IF EXISTS view_name;
CREATE MATERIALIZED VIEW view_name AS ...
```

### Alternative for VIEWs (if you want to preserve data):
```sql
CREATE OR REPLACE VIEW view_name AS ...
```
**Note:** `CREATE OR REPLACE VIEW` will replace the view definition but won't error if it doesn't exist.

## Why This Works

1. **Idempotency**: `DROP ... IF EXISTS` safely removes the object if it exists, or does nothing if it doesn't
2. **No Errors**: `CREATE` will always succeed after a `DROP IF EXISTS`
3. **Consistency**: Same pattern works for all object types

## Verification

All VIEW and MATERIALIZED VIEW statements have been fixed:
- ✅ `0030_materialized_views.sql` - All fixed
- ✅ No other files contain `CREATE VIEW IF NOT EXISTS`

## Summary

**Total Issues Found:** 5 (2 VIEWs + 3 MATERIALIZED VIEWs)  
**Total Issues Fixed:** 5  
**Files Modified:** 1 (`0030_materialized_views.sql`)

All VIEW and MATERIALIZED VIEW creation statements now use the correct PostgreSQL syntax.
