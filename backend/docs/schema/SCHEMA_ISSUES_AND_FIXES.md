# Database Schema - Issues Found & Fixes

## 🔴 **CRITICAL ISSUES IDENTIFIED**

### **Issue 1: ENUM CONFLICTS**

#### **Problem 1.1: `payment_status_type` Defined Twice**
- **File 1**: `0002_enterprise_rider_schema.sql` (line 91)
  ```sql
  CREATE TYPE payment_status_type AS ENUM (
    'pending', 'completed', 'failed', 'refunded'
  );
  ```
- **File 2**: `0008_unified_order_schema.sql` (line 46)
  ```sql
  CREATE TYPE payment_status_type AS ENUM (
    'pending', 'processing', 'completed', 'failed', 
    'refunded', 'partially_refunded', 'cancelled'
  );
  ```
- **Impact**: Migration will fail - enum already exists
- **Fix**: Remove from 0002, keep enhanced version in 0008

#### **Problem 1.2: `provider_type` vs `order_source_type` Overlap**
- **File 1**: `0006_external_providers_integration.sql` - `provider_type`
- **File 2**: `0008_unified_order_schema.sql` - `order_source_type`
- **Impact**: Duplicate concepts with different names
- **Fix**: Use `order_source_type` consistently, drop `provider_type`

#### **Problem 1.3: `onboarding_status` Conflict**
- **File 1**: `0001_premium_kylun.sql` - Old enum
- **File 2**: `0002_enterprise_rider_schema.sql` - Uses `onboarding_stage`
- **Impact**: Conflict if 0001 is run
- **Fix**: Drop old enum in 0003_consolidate

### **Issue 2: TABLE CONFLICTS**

#### **Problem 2.1: `orders` Table Already Exists**
- `0002_enterprise_rider_schema.sql` creates `orders` table
- `0008_unified_order_schema.sql` tries to extend `orders` table
- **Fix**: Ensure 0008 only uses `ALTER TABLE`, not `CREATE TABLE`

#### **Problem 2.2: `order_items` Created Multiple Times**
- Multiple files try to create `order_items`
- **Fix**: Create once in 0008, reference in others

### **Issue 3: FOREIGN KEY CONFLICTS**

#### **Problem 3.1: `riders.id` Type Mismatch**
- `riders.id` is `INTEGER` (0002)
- Some FK references use `BIGINT`
- **Fix**: Ensure all FK references to `riders.id` use `INTEGER`

#### **Problem 3.2: `orders.id` References**
- `order_actions` in 0002 uses `INTEGER` for `order_id`
- Should be `BIGINT` to match `orders.id` (BIGSERIAL)
- **Fix**: Update to `BIGINT`

### **Issue 4: MISSING DROP STATEMENTS**

- Old tables/enums from 0000 and 0001 not properly dropped
- **Fix**: Add DROP statements in 0003_consolidate

---

## ✅ **SOLUTIONS**

### **Fix 1: Consolidation File Update**
Update `0003_consolidate_schemas.sql` to:
- Drop old enums (onboarding_status)
- Drop old tables if they exist
- Migrate data if needed

### **Fix 2: Enum Deduplication**
- Remove `payment_status_type` from 0002
- Use enhanced version in 0008
- Rename `provider_type` to use `order_source_type`

### **Fix 3: FK Type Corrections**
- Update all `order_id` FK to `BIGINT`
- Ensure `rider_id` FK uses `INTEGER`

### **Fix 4: IF NOT EXISTS Guards**
- Add `IF NOT EXISTS` to all CREATE TYPE
- Add `IF NOT EXISTS` to all CREATE TABLE
- Add `IF NOT EXISTS` to all ALTER TABLE ADD COLUMN

---

## 🔧 **IMPLEMENTATION**

Creating corrected migration files...
