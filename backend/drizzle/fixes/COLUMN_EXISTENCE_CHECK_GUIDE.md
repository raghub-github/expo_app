# Column Existence Check Guide - Prevention of "Column Does Not Exist" Errors

## ⚠️ **CRITICAL RULES**

1. **NEVER reference a column in a function body, constraint, or trigger without first checking if it exists.**
2. **NEVER use `$$` delimiter inside a `DO $$` block - use `$func$` or `EXECUTE` with string literals instead.**

---

## 🔍 **THE PROBLEM**

PostgreSQL validates column references when:
1. Creating functions (even with EXECUTE)
2. Creating triggers
3. Adding constraints
4. Creating views

**Even with dynamic SQL (EXECUTE), PostgreSQL validates column references at function creation time.**

---

## ✅ **SOLUTION PATTERNS**

### **1. Constraints - Always Check Column Exists:**

```sql
-- ❌ WRONG - No check
ALTER TABLE withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_net_amount_valid 
  CHECK (net_amount IS NULL OR net_amount > 0);

-- ✅ CORRECT - Check first
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawal_requests' 
      AND column_name = 'net_amount'
  ) THEN
    ALTER TABLE withdrawal_requests
      ADD CONSTRAINT withdrawal_requests_net_amount_valid 
      CHECK (net_amount IS NULL OR net_amount > 0);
  END IF;
END $$;
```

### **2. Functions - Check Before Creating (Inside DO Blocks):**

```sql
-- ❌ WRONG - Using $$ delimiter inside DO $$ block (syntax error!)
DO $$
BEGIN
  CREATE OR REPLACE FUNCTION calculate_net_amount()
  RETURNS TRIGGER AS $$  -- ❌ CONFLICTS with outer DO $$ block!
  BEGIN
    NEW.net_amount := NEW.amount;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
END $$;

-- ✅ CORRECT - Use EXECUTE with different delimiter ($func$)
DO $$
DECLARE
  v_has_net_amount BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawal_requests' 
      AND column_name = 'net_amount'
  ) INTO v_has_net_amount;
  
  -- Only create function if column exists
  IF NOT v_has_net_amount THEN
    RETURN;  -- Exit early, don't create function
  END IF;
  
  -- Column exists, safe to create function using EXECUTE with $func$ delimiter
  EXECUTE 'CREATE OR REPLACE FUNCTION calculate_net_amount()
RETURNS TRIGGER AS $func$
BEGIN
  NEW.net_amount := NEW.amount;
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;';
END $$;
```

**Why?** Inside a `DO $$` block, you cannot use `$$` as a delimiter for nested functions. Use `EXECUTE` with a different delimiter like `$func$`, `$body$`, etc.

### **3. Triggers - Check Table and Columns:**

```sql
-- ✅ CORRECT - Check table and columns exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rider_vehicles') THEN
    -- Check columns exist
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'rider_vehicles' 
        AND column_name = 'is_active'
    ) THEN
      CREATE OR REPLACE FUNCTION ensure_single_active_vehicle() ...
      CREATE TRIGGER ...;
    END IF;
  END IF;
END $$;
```

---

## 📋 **CHECKLIST FOR ALL MIGRATION FILES**

Before adding any constraint, function, or trigger:

- [ ] Check if table exists (for constraints/functions/triggers)
- [ ] Check if column exists (for column-specific operations)
- [ ] Use DO $$ blocks for conditional creation
- [ ] Use early RETURN if column doesn't exist
- [ ] Drop functions/triggers first if recreating
- [ ] Test with columns that don't exist

---

## 🎯 **FIXED IN 0007_relationships_and_constraints.sql**

All constraints and functions now check for column/table existence:
- ✅ `withdrawal_requests` constraints (net_amount, processing_fee)
- ✅ `wallet_ledger` constraints (balance)
- ✅ `orders` constraints (package dimensions, passenger count, surge_multiplier)
- ✅ `calculate_withdrawal_net_amount()` function (only created if net_amount exists)
- ✅ All trigger functions (check table/column existence)

---

## 🚀 **STATUS**

- ✅ All column references checked
- ✅ All functions check before creation
- ✅ All triggers check before creation
- ✅ Early RETURN if columns don't exist
- ✅ No more "column does not exist" errors expected

**This file is now bulletproof!**
