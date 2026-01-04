# Migration Checklist - Quick Reference

## ✅ **RUN THESE 21 FILES IN ORDER**

Copy each file content into Supabase SQL Editor and run it.

---

### **PHASE 1: Rider Domain**
- [ ] **1/21** `0002_enterprise_rider_schema.sql`
- [ ] **2/21** `0003_consolidate_schemas_FIXED.sql` ⚠️ Use FIXED version
- [ ] **3/21** `0004_production_enhancements.sql`

### **PHASE 2: Orders - Service Specific**
- [ ] **4/21** `0005_service_specific_orders.sql`

### **PHASE 3: External Providers**
- [ ] **5/21** `0006_external_providers_integration.sql`
- [ ] **6/21** `0009_external_provider_order_enhancements.sql`

### **PHASE 4: Orders - Unified**
- [ ] **7/21** `0007_relationships_and_constraints.sql`
- [ ] **8/21** `0008_unified_order_schema.sql`

### **PHASE 5: Merchant Domain**
- [ ] **9/21** `0010_merchant_domain_complete.sql`
- [ ] **10/21** `0011_merchant_domain_operations.sql`
- [ ] **11/21** `0012_merchant_registration_and_relationships.sql`

### **PHASE 6: Customer Domain**
- [ ] **12/21** `0013_customer_domain_complete.sql`
- [ ] **13/21** `0014_customer_loyalty_and_support.sql`
- [ ] **14/21** `0015_customer_analytics_and_relationships.sql`

### **PHASE 7: Access Management**
- [ ] **15/21** `0016_access_management_complete.sql`
- [ ] **16/21** `0017_access_controls_and_audit.sql`
- [ ] **17/21** `0018_access_triggers_and_defaults.sql`

### **PHASE 8: Fixes**
- [ ] **18/21** `0019_enum_and_fk_fixes.sql`

### **PHASE 9: Unified Tickets**
- [ ] **19/21** `0020_unified_ticket_system.sql`
- [ ] **20/21** `0021_unified_ticket_data_migration.sql`

---

## ✅ **ALL FILES ARE READY:**
- ✅ Old/conflicting files have been removed
- ✅ Only correct migration files remain
- ✅ Run all files in order (0002-0021)

---

## ✅ **VERIFICATION (Run After All Migrations):**

```sql
-- 1. Check tables
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Expected: ~180+

-- 2. Check key tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('riders', 'orders', 'customers', 'merchant_stores', 'system_users', 'unified_tickets');
-- Expected: 6 tables

-- 3. Check ticket titles
SELECT COUNT(*) FROM ticket_title_config;
-- Expected: 43
```

---

## 📍 **WHERE TO RUN:**

1. Go to **Supabase Dashboard**
2. Click **"SQL Editor"** (left sidebar)
3. Click **"New Query"**
4. **Copy & Paste** file content
5. Click **"Run"** (or Ctrl+Enter)
6. **Wait for success** ✅
7. **Move to next file**

---

**Total Time:** ~10-15 minutes  
**Total Files:** 21 migrations  
**Status:** Ready to start! 🚀
