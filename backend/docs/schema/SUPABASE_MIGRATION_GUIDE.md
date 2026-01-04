# Supabase SQL Editor - Complete Migration Guide

## 🎯 **STEP-BY-STEP GUIDE**

This guide will walk you through running **ALL 21 migration files** in Supabase SQL Editor, one by one.

---

## ⚠️ **IMPORTANT NOTES BEFORE STARTING**

### **All Files Are Ready to Use:**
- ✅ All old/conflicting files have been removed
- ✅ Only the correct migration files remain
- ✅ Run all files in numerical order (0002 through 0021)

---

## 📋 **COMPLETE MIGRATION LIST (21 Files)**

### **Phase 1: Rider Domain (3 files)**
1. `0002_enterprise_rider_schema.sql`
2. `0003_consolidate_schemas_FIXED.sql`
3. `0004_production_enhancements.sql`

### **Phase 2: Orders Domain - Service Specific (1 file)**
4. `0005_service_specific_orders.sql`

### **Phase 3: External Provider Integration (2 files)**
5. `0006_external_providers_integration.sql`
6. `0009_external_provider_order_enhancements.sql`

### **Phase 4: Orders Domain - Unified (2 files)**
7. `0007_relationships_and_constraints.sql`
8. `0008_unified_order_schema.sql`

### **Phase 5: Merchant Domain (3 files)**
9. `0010_merchant_domain_complete.sql`
10. `0011_merchant_domain_operations.sql`
11. `0012_merchant_registration_and_relationships.sql`

### **Phase 6: Customer Domain (3 files)**
12. `0013_customer_domain_complete.sql`
13. `0014_customer_loyalty_and_support.sql`
14. `0015_customer_analytics_and_relationships.sql`

### **Phase 7: Access Management (3 files)**
15. `0016_access_management_complete.sql`
16. `0017_access_controls_and_audit.sql`
17. `0018_access_triggers_and_defaults.sql`

### **Phase 8: Fixes (1 file)**
18. `0019_enum_and_fk_fixes.sql`

### **Phase 9: Unified Ticket System (2 files)**
19. `0020_unified_ticket_system.sql`
20. `0021_unified_ticket_data_migration.sql`

---

## 🚀 **STEP-BY-STEP INSTRUCTIONS**

### **Step 1: Open Supabase SQL Editor**

1. Go to your Supabase project dashboard
2. Click on **"SQL Editor"** in the left sidebar
3. Click **"New Query"** to create a new SQL query

---

### **Step 2: Run Each Migration File**

For each file below, follow these steps:

1. **Open the migration file** from `backend/drizzle/` folder
2. **Copy ALL content** from the file
3. **Paste into Supabase SQL Editor**
4. **Click "Run"** (or press Ctrl+Enter)
5. **Wait for success** - You should see "Success. No rows returned"
6. **Check for errors** - If you see errors, read them carefully and fix before continuing

---

## 📝 **DETAILED EXECUTION ORDER**

### **MIGRATION 1/21: Rider Schema**
**File:** `0002_enterprise_rider_schema.sql`

**What it does:**
- Creates rider tables (riders, documents, devices, etc.)
- Creates basic enums
- Sets up RLS policies

**Expected result:** ✅ Success. No rows returned

**Time:** ~30 seconds

---

### **MIGRATION 2/21: Consolidate Schemas (FIXED)**
**File:** `0003_consolidate_schemas_FIXED.sql`

**What it does:**
- Drops old conflicting enums/tables
- Fixes foreign key types
- Enhances existing tables

**Expected result:** ✅ Success. No rows returned

**Time:** ~20 seconds

---

### **MIGRATION 3/21: Production Enhancements**
**File:** `0004_production_enhancements.sql`

**What it does:**
- Adds production-ready features
- Enhances indexes
- Adds analytics tables

**Expected result:** ✅ Success. No rows returned

**Time:** ~15 seconds

---

### **MIGRATION 4/21: Service Specific Orders**
**File:** `0005_service_specific_orders.sql`

**What it does:**
- Adds service-specific order fields
- Food, Parcel, Ride specific tables

**Expected result:** ✅ Success. No rows returned

**Time:** ~20 seconds

---

### **MIGRATION 5/21: External Providers Integration**
**File:** `0006_external_providers_integration.sql`

**What it does:**
- Creates provider config tables
- Webhook handling
- API integration tables

**Expected result:** ✅ Success. No rows returned

**Time:** ~25 seconds

---

### **MIGRATION 6/21: External Provider Order Enhancements**
**File:** `0009_external_provider_order_enhancements.sql`

**What it does:**
- Provider order mapping
- Status sync
- Payment/refund mapping

**Expected result:** ✅ Success. No rows returned

**Time:** ~30 seconds

---

### **MIGRATION 7/21: Relationships and Constraints**
**File:** `0007_relationships_and_constraints.sql`

**What it does:**
- Adds foreign key constraints
- Creates relationships between tables
- Adds check constraints

**Expected result:** ✅ Success. No rows returned

**Time:** ~20 seconds

---

### **MIGRATION 8/21: Unified Order Schema**
**File:** `0008_unified_order_schema.sql`

**What it does:**
- Creates unified orders table
- Order items, payments, timeline
- Complete order management

**Expected result:** ✅ Success. No rows returned

**Time:** ~45 seconds

---

### **MIGRATION 9/21: Merchant Domain Complete**
**File:** `0010_merchant_domain_complete.sql`

**What it does:**
- Creates merchant parent/stores
- Menu management
- Verification tables

**Expected result:** ✅ Success. No rows returned

**Time:** ~60 seconds

---

### **MIGRATION 10/21: Merchant Domain Operations**
**File:** `0011_merchant_domain_operations.sql`

**What it does:**
- Operating hours
- Payouts and settlements
- Commission rules

**Expected result:** ✅ Success. No rows returned

**Time:** ~50 seconds

---

### **MIGRATION 11/21: Merchant Registration and Relationships**
**File:** `0012_merchant_registration_and_relationships.sql`

**What it does:**
- Registration progress
- Final relationships
- Analytics tables

**Expected result:** ✅ Success. No rows returned

**Time:** ~30 seconds

---

### **MIGRATION 12/21: Customer Domain Complete**
**File:** `0013_customer_domain_complete.sql`

**What it does:**
- Creates customers table
- Devices, addresses, contacts
- Payment methods, wallet

**Expected result:** ✅ Success. No rows returned

**Time:** ~60 seconds

---

### **MIGRATION 13/21: Customer Loyalty and Support**
**File:** `0014_customer_loyalty_and_support.sql`

**What it does:**
- Loyalty programs
- Ratings and reviews
- Support tickets (old system)

**Expected result:** ✅ Success. No rows returned

**Time:** ~50 seconds

---

### **MIGRATION 14/21: Customer Analytics and Relationships**
**File:** `0015_customer_analytics_and_relationships.sql`

**What it does:**
- Activity logs
- Analytics tables
- Referrals
- Final relationships

**Expected result:** ✅ Success. No rows returned

**Time:** ~40 seconds

---

### **MIGRATION 15/21: Access Management Complete**
**File:** `0016_access_management_complete.sql`

**What it does:**
- System users and roles
- Permissions system
- RBAC tables

**Expected result:** ✅ Success. No rows returned

**Time:** ~45 seconds

---

### **MIGRATION 16/21: Access Controls and Audit**
**File:** `0017_access_controls_and_audit.sql`

**What it does:**
- Domain-specific access controls
- Audit logs
- Approval workflows

**Expected result:** ✅ Success. No rows returned

**Time:** ~50 seconds

---

### **MIGRATION 17/21: Access Triggers and Defaults**
**File:** `0018_access_triggers_and_defaults.sql`

**What it does:**
- Creates triggers
- Inserts default roles/permissions
- Sets up audit triggers

**Expected result:** ✅ Success. No rows returned

**Time:** ~40 seconds

---

### **MIGRATION 18/21: Enum and FK Fixes**
**File:** `0019_enum_and_fk_fixes.sql`

**What it does:**
- Fixes enum conflicts
- Fixes foreign key type mismatches
- Adds missing constraints

**Expected result:** ✅ Success. No rows returned

**Time:** ~30 seconds

---

### **MIGRATION 19/21: Unified Ticket System**
**File:** `0020_unified_ticket_system.sql`

**What it does:**
- Creates unified ticket system
- All ticket types and sources
- Fixed titles configuration

**Expected result:** ✅ Success. No rows returned

**Time:** ~60 seconds

---

### **MIGRATION 20/21: Unified Ticket Data Migration**
**File:** `0021_unified_ticket_data_migration.sql`

**What it does:**
- Populates ticket titles
- Migrates existing tickets
- Sets up auto-generation rules

**Expected result:** ✅ Success. No rows returned

**Time:** ~30 seconds

---

## ✅ **VERIFICATION QUERIES**

After running ALL migrations, run these queries to verify:

### **1. Check Total Tables:**
```sql
SELECT COUNT(*) AS total_tables 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE';
```
**Expected:** ~180+ tables

### **2. Check Total Enums:**
```sql
SELECT typname, COUNT(*) 
FROM pg_type 
WHERE typtype = 'e' 
  AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY typname;
```
**Expected:** 50+ enums

### **3. Check Foreign Keys:**
```sql
SELECT COUNT(*) AS total_foreign_keys
FROM information_schema.table_constraints 
WHERE constraint_type = 'FOREIGN KEY'
  AND table_schema = 'public';
```
**Expected:** 250+ foreign keys

### **4. Check Indexes:**
```sql
SELECT COUNT(*) AS total_indexes
FROM pg_indexes 
WHERE schemaname = 'public';
```
**Expected:** 500+ indexes

### **5. Check Key Tables Exist:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'riders', 'orders', 'customers', 'merchant_stores', 
    'system_users', 'unified_tickets'
  )
ORDER BY table_name;
```
**Expected:** All 6 tables should exist

### **6. Check Ticket System:**
```sql
SELECT COUNT(*) AS ticket_titles
FROM ticket_title_config;
```
**Expected:** 43 ticket titles

---

## 🐛 **TROUBLESHOOTING**

### **Error: "relation already exists"**
**Solution:** The table/enum already exists. This is OK if you're re-running migrations. You can:
- Skip that migration
- Or add `IF NOT EXISTS` to the CREATE statement

### **Error: "type already exists"**
**Solution:** The enum already exists. This is OK. Continue to next migration.

### **Error: "foreign key constraint violation"**
**Solution:** 
1. Check if referenced table exists
2. Check if you ran migrations in correct order
3. Check if data exists that violates constraint

### **Error: "column does not exist"**
**Solution:**
1. Check if you ran previous migrations
2. Check if column name is correct
3. Check if table exists

---

## 📊 **EXPECTED RESULTS**

After completing all 21 migrations:

- ✅ **~180 tables** created
- ✅ **50+ enums** created
- ✅ **250+ foreign keys** established
- ✅ **500+ indexes** created
- ✅ **43 ticket titles** configured
- ✅ **All relationships** working
- ✅ **RLS policies** enabled

---

## ⏱️ **TOTAL TIME ESTIMATE**

- **Per migration:** 15-60 seconds
- **Total time:** ~10-15 minutes (if no errors)

---

## 🎯 **QUICK CHECKLIST**

Use this checklist to track your progress:

- [ ] Migration 1/21: `0002_enterprise_rider_schema.sql`
- [ ] Migration 2/21: `0003_consolidate_schemas_FIXED.sql`
- [ ] Migration 3/21: `0004_production_enhancements.sql`
- [ ] Migration 4/21: `0005_service_specific_orders.sql`
- [ ] Migration 5/21: `0006_external_providers_integration.sql`
- [ ] Migration 6/21: `0009_external_provider_order_enhancements.sql`
- [ ] Migration 7/21: `0007_relationships_and_constraints.sql`
- [ ] Migration 8/21: `0008_unified_order_schema.sql`
- [ ] Migration 9/21: `0010_merchant_domain_complete.sql`
- [ ] Migration 10/21: `0011_merchant_domain_operations.sql`
- [ ] Migration 11/21: `0012_merchant_registration_and_relationships.sql`
- [ ] Migration 12/21: `0013_customer_domain_complete.sql`
- [ ] Migration 13/21: `0014_customer_loyalty_and_support.sql`
- [ ] Migration 14/21: `0015_customer_analytics_and_relationships.sql`
- [ ] Migration 15/21: `0016_access_management_complete.sql`
- [ ] Migration 16/21: `0017_access_controls_and_audit.sql`
- [ ] Migration 17/21: `0018_access_triggers_and_defaults.sql`
- [ ] Migration 18/21: `0019_enum_and_fk_fixes.sql`
- [ ] Migration 19/21: `0020_unified_ticket_system.sql`
- [ ] Migration 20/21: `0021_unified_ticket_data_migration.sql`
- [ ] Verification queries passed

---

## ✅ **YOU'RE DONE!**

Once all migrations are complete and verification queries pass, your database is ready for production!

**Status:** ✅ **READY TO DEPLOY**

---

## 📚 **NEXT STEPS**

1. ✅ Run all 21 migrations
2. ✅ Verify with queries above
3. ✅ Test your application
4. ✅ Start building features!

---

**Need Help?** Check `docs/schema/` folder for detailed documentation.
