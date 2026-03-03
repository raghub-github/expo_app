# Database Migrations - Clean & Ready

## ✅ **ALL FILES ARE READY TO USE**

All old/conflicting files have been **removed**. Only the correct migration files remain.

---

## 📋 **MIGRATION FILES (20 Files - Run in Order)**

### **Phase 1: Rider Domain (3 files)**
1. ✅ `0002_enterprise_rider_schema.sql`
2. ✅ `0003_consolidate_schemas_FIXED.sql`
3. ✅ `0004_production_enhancements.sql`

### **Phase 2: Orders - Service Specific (1 file)**
4. ✅ `0005_service_specific_orders.sql`

### **Phase 3: External Providers (2 files)**
5. ✅ `0006_external_providers_integration.sql`
6. ✅ `0009_external_provider_order_enhancements.sql`

### **Phase 4: Orders - Unified (2 files)**
7. ✅ `0007_relationships_and_constraints.sql`
8. ✅ `0008_unified_order_schema.sql`

### **Phase 5: Merchant Domain (3 files)**
9. ✅ `0010_merchant_domain_complete.sql`
10. ✅ `0011_merchant_domain_operations.sql`
11. ✅ `0012_merchant_registration_and_relationships.sql`

### **Phase 6: Customer Domain (3 files)**
12. ✅ `0013_customer_domain_complete.sql`
13. ✅ `0014_customer_loyalty_and_support.sql`
14. ✅ `0015_customer_analytics_and_relationships.sql`

### **Phase 7: Access Management (3 files)**
15. ✅ `0016_access_management_complete.sql`
16. ✅ `0017_access_controls_and_audit.sql`
17. ✅ `0018_access_triggers_and_defaults.sql`

### **Phase 8: Fixes (1 file)**
18. ✅ `0019_enum_and_fk_fixes.sql`

### **Phase 9: Unified Tickets (2 files)**
19. ✅ `0020_unified_ticket_system.sql`
20. ✅ `0021_unified_ticket_data_migration.sql`

### **Phase 10: Customer addresses & delivery snapshot**
21. ✅ `0070_customer_addresses_and_active_location.sql` – saved addresses + active delivery location (required for Saved addresses / Location in app)
22. ✅ `0071_orders_delivery_location_snapshot.sql` – delivery lat/lon/address on orders (run after 0070)
23. ✅ `0072_restaurant_reports.sql` – customer reports about restaurant (menu/pricing/fraud); used by Report issue in app

---

## 🗑️ **FILES REMOVED (No Longer Needed)**

The following old/conflicting files have been **deleted**:

- ❌ `0000_left_outlaw_kid.sql` - Old schema with TEXT IDs (conflicts with 0002)
- ❌ `0001_premium_kylun.sql` - Old schema with conflicting enums (conflicts with 0002)
- ❌ `0002_enterprise_rider_schema_FIXED.sql` - Duplicate (use regular 0002)
- ❌ `0003_consolidate_schemas.sql` - Old version (use FIXED version)

**Why removed?**
- These files created conflicts (different ID types, conflicting enums)
- All their functionality is now in the correct migration files
- Keeping them caused confusion about which files to run

---

## 🚀 **HOW TO RUN**

### **Option 1: Supabase SQL Editor (Recommended)**
1. Open Supabase SQL Editor
2. Run each file in order (0002 → 0021)
3. Copy & paste file content
4. Click "Run"
5. Wait for success ✅

### **Option 2: Command Line**
```bash
cd backend/drizzle
export DATABASE_URL="your_supabase_connection_string"

# Run all migrations (including customer addresses)
psql $DATABASE_URL -f 0002_enterprise_rider_schema.sql
psql $DATABASE_URL -f 0003_consolidate_schemas_FIXED.sql
# ... through 0021, then:
psql $DATABASE_URL -f 0070_customer_addresses_and_active_location.sql
psql $DATABASE_URL -f 0071_orders_delivery_location_snapshot.sql
psql $DATABASE_URL -f 0072_restaurant_reports.sql
```

---

## ✅ **VERIFICATION**

After running all migrations, verify with:

```sql
-- Check total tables (should be ~180+)
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- Check key tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('riders', 'orders', 'customers', 'merchant_stores', 'system_users', 'unified_tickets', 'customer_addresses', 'customer_active_location');
```

---

## 📚 **DOCUMENTATION**

- **Migration Guide:** `../docs/schema/SUPABASE_MIGRATION_GUIDE.md`
- **Quick Checklist:** `MIGRATION_CHECKLIST.md`
- **Complete Architecture:** `../docs/schema/GATIMITRA_FINAL_COMPLETE_ARCHITECTURE.md`

---

**Status:** ✅ **CLEAN & READY**  
**Total Files:** 20 migrations  
**Total Tables:** ~180 tables  
**Ready:** Production deployment
