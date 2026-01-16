# GatiMitra Database Schema

## 📚 **Complete Production-Grade Database**

**5 Domains | 178 Tables | 19 Migrations | Production Ready**

---

## 🚀 **QUICK START**

### **1. Read Documentation:**
📖 **[docs/schema/00_README.md](./docs/schema/00_README.md)** - Start here

### **2. Execute Migrations:**
```bash
cd backend/drizzle
export DATABASE_URL="your_supabase_url"

# Run all 19 migrations in order
psql $DATABASE_URL -f 0002_enterprise_rider_schema.sql
psql $DATABASE_URL -f 0003_consolidate_schemas_FIXED.sql
# ... (continue for all 19 files)
psql $DATABASE_URL -f 0019_enum_and_fk_fixes.sql
```

### **3. Verify:**
```sql
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
-- Should return 178+
```

---

## 📊 **SCHEMA OVERVIEW**

### **Domains:**
- **Riders** (23 tables) - Onboarding, tracking, earnings
- **Orders** (30 tables) - Unified orders, multi-service
- **Merchants** (39 tables) - Stores, menu, payouts
- **Customers** (47 tables) - Profile, wallet, loyalty
- **Access Management** (39 tables) - RBAC, audit, security

### **Features:**
- ✅ Multi-service (food, parcel, ride)
- ✅ External providers (Swiggy, Zomato, Rapido, ONDC)
- ✅ Complete audit trails
- ✅ GDPR compliant
- ✅ Production ready

---

## 📁 **FILE STRUCTURE**

```
backend/
├── drizzle/
│   ├── 0002-0019_*.sql (19 migration files)
│   └── meta/ (Drizzle metadata)
│
├── docs/schema/ (8 essential docs)
│   ├── 00_README.md ⭐ START HERE
│   ├── QUICK_START_GUIDE.md
│   ├── GATIMITRA_FINAL_COMPLETE_ARCHITECTURE.md
│   └── ... (5 more)
│
├── src/db/
│   └── schema.ts (Drizzle schema)
│
└── README_DATABASE.md (this file)
```

---

## 🔗 **KEY RELATIONSHIPS**

```
CUSTOMERS → ORDERS → MERCHANTS
               ↓
            RIDERS
               ↓
        ACCESS MANAGEMENT (controls all)
```

---

## ✅ **STATUS**

- **Schema**: ✅ Complete & reviewed
- **Issues**: ✅ All fixed
- **Docs**: ✅ Organized in docs/schema/
- **Ready**: ✅ Production deployment

---

**For complete documentation, see:** `docs/schema/00_README.md`
