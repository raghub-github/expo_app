# Database Schema Organization - Best Practices for Large Systems

## 🎯 **YOUR QUESTION**

With 178 tables, 19 migrations, 50+ enums - what's the professional way to organize this?

---

## ✅ **RECOMMENDED APPROACH: PostgreSQL SCHEMAS (Namespaces)**

### **Best Practice: Use PostgreSQL Schemas (NOT separate databases)**

```sql
-- Create separate schemas for each domain
CREATE SCHEMA IF NOT EXISTS riders;
CREATE SCHEMA IF NOT EXISTS orders;
CREATE SCHEMA IF NOT EXISTS merchants;
CREATE SCHEMA IF NOT EXISTS customers;
CREATE SCHEMA IF NOT EXISTS access_mgmt;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS public; -- Shared/common
```

### **Benefits:**
✅ **Single Database** - All data in one place  
✅ **Logical Separation** - Each domain has its own namespace  
✅ **Easy Cross-Schema Queries** - Can join across schemas  
✅ **Better Organization** - Clear domain boundaries  
✅ **Access Control** - Per-schema permissions  
✅ **Backup Flexibility** - Can backup schemas separately  
✅ **Migration Management** - Organized by domain  

---

## 📊 **RECOMMENDED STRUCTURE**

### **Schema Organization:**

```
gatimitra_db (Single Database)
├── riders (Schema)
│   ├── riders
│   ├── rider_documents
│   ├── rider_devices
│   ├── duty_logs
│   ├── location_logs
│   ├── wallet_ledger
│   ├── ... (23 tables)
│
├── orders (Schema)
│   ├── orders ← Central table
│   ├── order_items
│   ├── order_payments
│   ├── order_refunds
│   ├── order_rider_assignments
│   ├── order_timeline
│   ├── ... (30 tables)
│
├── merchants (Schema)
│   ├── merchant_parents
│   ├── merchant_stores
│   ├── merchant_menu_items
│   ├── merchant_offers
│   ├── merchant_store_payouts
│   ├── ... (39 tables)
│
├── customers (Schema)
│   ├── customers
│   ├── customer_addresses
│   ├── customer_wallet
│   ├── customer_loyalty
│   ├── customer_tickets
│   ├── ... (47 tables)
│
├── access_mgmt (Schema)
│   ├── system_users
│   ├── system_roles
│   ├── system_permissions
│   ├── ... (39 tables)
│
└── audit (Schema)
    ├── system_audit_logs
    ├── merchant_audit_logs
    ├── customer_audit_log
    └── ... (audit tables)
```

---

## 📁 **MIGRATION FILE ORGANIZATION**

### **Recommended Folder Structure:**

```
backend/drizzle/
├── migrations/
│   ├── 001_riders/
│   │   ├── 0002_enterprise_rider_schema.sql
│   │   ├── 0003_consolidate_schemas.sql
│   │   └── 0004_production_enhancements.sql
│   │
│   ├── 002_orders/
│   │   ├── 0005_service_specific_orders.sql
│   │   ├── 0006_external_providers.sql
│   │   ├── 0007_relationships.sql
│   │   ├── 0008_unified_order_schema.sql
│   │   └── 0009_provider_enhancements.sql
│   │
│   ├── 003_merchants/
│   │   ├── 0010_merchant_domain.sql
│   │   ├── 0011_merchant_operations.sql
│   │   └── 0012_merchant_relationships.sql
│   │
│   ├── 004_customers/
│   │   ├── 0013_customer_domain.sql
│   │   ├── 0014_customer_loyalty.sql
│   │   └── 0015_customer_analytics.sql
│   │
│   ├── 005_access/
│   │   ├── 0016_access_management.sql
│   │   ├── 0017_access_controls.sql
│   │   └── 0018_access_triggers.sql
│   │
│   └── 999_fixes/
│       └── 0019_enum_and_fk_fixes.sql
│
├── seeds/
│   ├── 001_riders_seed.sql
│   ├── 002_merchants_seed.sql
│   └── 003_access_seed.sql
│
└── rollbacks/ (optional)
    ├── rollback_0002.sql
    └── ... (rollback scripts)
```

---

## 🛠️ **RECOMMENDED TOOLS**

### **1. Drizzle Kit (Your Current Choice) ✅**

**Pros:**
- TypeScript-first
- Type-safe migrations
- Auto-generates types
- Good for development

**Recommended Setup:**

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/*.ts', // Split schemas
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Use schemas for organization
  schemaFilter: ['riders', 'orders', 'merchants', 'customers', 'access_mgmt', 'public'],
});
```

### **2. Flyway or Liquibase (Enterprise Alternative)**

**When to use:**
- Very large teams (50+ developers)
- Complex CI/CD pipelines
- Need rollback support
- Enterprise compliance requirements

### **3. Supabase Migration Management**

**Built-in Features:**
```bash
# Supabase CLI
supabase migration new riders_schema
supabase migration up
supabase db diff
```

---

## 🎯 **RECOMMENDED APPROACH FOR YOUR PROJECT**

### **Option 1: Schema-Based Organization (BEST)**

Create separate PostgreSQL schemas:

```sql
-- 0001_create_schemas.sql
CREATE SCHEMA IF NOT EXISTS riders;
CREATE SCHEMA IF NOT EXISTS orders;
CREATE SCHEMA IF NOT EXISTS merchants;
CREATE SCHEMA IF NOT EXISTS customers;
CREATE SCHEMA IF NOT EXISTS access_mgmt;
CREATE SCHEMA IF NOT EXISTS audit;

-- Set search path
ALTER DATABASE gatimitra SET search_path TO riders, orders, merchants, customers, access_mgmt, audit, public;
```

Then organize tables:

```sql
-- Riders domain
CREATE TABLE riders.riders (...);
CREATE TABLE riders.rider_documents (...);
CREATE TABLE riders.wallet_ledger (...);

-- Orders domain
CREATE TABLE orders.orders (...);
CREATE TABLE orders.order_items (...);

-- Merchants domain
CREATE TABLE merchants.merchant_stores (...);
CREATE TABLE merchants.menu_items (...);

-- Customers domain
CREATE TABLE customers.customers (...);
CREATE TABLE customers.addresses (...);

-- Cross-schema foreign keys work perfectly
ALTER TABLE orders.orders
  ADD CONSTRAINT orders_customer_fkey
  FOREIGN KEY (customer_id) REFERENCES customers.customers(id);
```

**Advantages:**
- ✅ Clear domain boundaries
- ✅ Easy to understand structure
- ✅ Better access control (schema-level permissions)
- ✅ Easier to backup individual domains
- ✅ Can assign different owners to different schemas

---

### **Option 2: Table Prefixing (Your Current Approach)**

Keep everything in `public` schema but use prefixes:

```sql
-- Current approach
riders, rider_documents, rider_devices
orders, order_items, order_payments
merchant_stores, merchant_menu_items
customers, customer_addresses
system_users, system_roles
```

**Advantages:**
- ✅ Simpler setup
- ✅ All tables visible together
- ✅ No schema switching needed

**Disadvantages:**
- ❌ 178 tables in one namespace
- ❌ Harder to see domain boundaries
- ❌ No schema-level permissions

---

## 🚀 **DRIZZLE ORM SCHEMA ORGANIZATION**

### **Recommended File Structure:**

```typescript
// Split schema.ts into multiple files

backend/src/db/
├── schema/
│   ├── index.ts (exports all)
│   ├── riders/
│   │   ├── riders.schema.ts
│   │   ├── documents.schema.ts
│   │   ├── wallet.schema.ts
│   │   └── index.ts
│   │
│   ├── orders/
│   │   ├── orders.schema.ts
│   │   ├── order-items.schema.ts
│   │   ├── payments.schema.ts
│   │   ├── rider-assignments.schema.ts
│   │   └── index.ts
│   │
│   ├── merchants/
│   │   ├── stores.schema.ts
│   │   ├── menu.schema.ts
│   │   ├── offers.schema.ts
│   │   └── index.ts
│   │
│   ├── customers/
│   │   ├── customers.schema.ts
│   │   ├── wallet.schema.ts
│   │   ├── loyalty.schema.ts
│   │   └── index.ts
│   │
│   └── access/
│       ├── users.schema.ts
│       ├── roles.schema.ts
│       └── index.ts
│
└── migrations/ (Generated by Drizzle Kit)
    ├── 0001_riders_initial.sql
    ├── 0002_orders_initial.sql
    └── ... (auto-generated)
```

**Example: riders.schema.ts**
```typescript
import { pgSchema, integer, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';

// Create schema
export const ridersSchema = pgSchema('riders');

// Define enums in the schema
export const onboardingStageEnum = ridersSchema.enum('onboarding_stage', [
  'MOBILE_VERIFIED', 'KYC', 'PAYMENT', 'APPROVAL', 'ACTIVE'
]);

// Define tables in the schema
export const riders = ridersSchema.table('riders', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  mobile: text('mobile').notNull().unique(),
  name: text('name'),
  onboardingStage: onboardingStageEnum('onboarding_stage').notNull(),
  // ... other fields
});
```

---

## 📋 **MIGRATION EXECUTION STRATEGIES**

### **Strategy 1: Sequential Execution (Current)**

```bash
# Run all migrations in order
psql $DB_URL -f 0002_riders.sql
psql $DB_URL -f 0003_consolidate.sql
# ... etc
```

**Pros:** Simple, straightforward  
**Cons:** Manual, error-prone for 19 files

---

### **Strategy 2: Migration Tool (RECOMMENDED)**

```bash
# Using Drizzle Kit
npm run drizzle-kit push:pg

# Or Flyway
flyway migrate

# Or Liquibase
liquibase update

# Or Supabase CLI
supabase db push
```

**Pros:**
- ✅ Tracks which migrations ran
- ✅ Prevents duplicate execution
- ✅ Rollback support
- ✅ CI/CD friendly

---

### **Strategy 3: Migration Table**

Create a migration tracking table:

```sql
CREATE TABLE schema_migrations (
  id BIGSERIAL PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  execution_time_ms INTEGER,
  checksum TEXT,
  success BOOLEAN DEFAULT TRUE
);

-- Track each migration
INSERT INTO schema_migrations (version, name, execution_time_ms)
VALUES ('0002', 'enterprise_rider_schema', 1234);
```

Then use a script:

```bash
#!/bin/bash
# migrate.sh

for file in drizzle/*.sql; do
  version=$(basename $file .sql)
  
  # Check if already executed
  exists=$(psql $DB_URL -t -c "SELECT 1 FROM schema_migrations WHERE version = '$version'")
  
  if [ -z "$exists" ]; then
    echo "Running $file..."
    start=$(date +%s%N)
    psql $DB_URL -f $file
    end=$(date +%s%N)
    duration=$(( ($end - $start) / 1000000 ))
    
    psql $DB_URL -c "INSERT INTO schema_migrations (version, name, execution_time_ms) VALUES ('$version', '$file', $duration)"
  else
    echo "Skipping $file (already executed)"
  fi
done
```

---

## 🏗️ **PROFESSIONAL SCHEMA ORGANIZATION**

### **Recommended: Domain-Driven Design (DDD) with PostgreSQL Schemas**

```sql
-- 1. Create schemas
CREATE SCHEMA riders;
CREATE SCHEMA orders;
CREATE SCHEMA merchants;
CREATE SCHEMA customers;
CREATE SCHEMA access_mgmt;
CREATE SCHEMA audit;
CREATE SCHEMA shared; -- For shared enums/types

-- 2. Create shared enums
CREATE TYPE shared.service_type AS ENUM ('FOOD', 'PARCEL', 'RIDE');
CREATE TYPE shared.order_status_type AS ENUM ('assigned', 'accepted', ...);

-- 3. Create domain tables in their schemas
CREATE TABLE riders.riders (...);
CREATE TABLE orders.orders (...);
CREATE TABLE merchants.merchant_stores (...);
CREATE TABLE customers.customers (...);

-- 4. Cross-schema relationships work perfectly
ALTER TABLE orders.orders
  ADD CONSTRAINT orders_customer_fk
  FOREIGN KEY (customer_id) REFERENCES customers.customers(id);

ALTER TABLE orders.order_rider_assignments
  ADD CONSTRAINT order_rider_assignments_rider_fk
  FOREIGN KEY (rider_id) REFERENCES riders.riders(id);
```

---

## 📁 **UPDATED FOLDER STRUCTURE**

```
backend/
├── drizzle/
│   ├── migrations/
│   │   ├── 000_schemas/
│   │   │   └── 0001_create_schemas.sql
│   │   │
│   │   ├── 001_shared/
│   │   │   └── 0002_shared_enums.sql
│   │   │
│   │   ├── 002_riders/
│   │   │   ├── 0003_riders_core.sql
│   │   │   ├── 0004_riders_wallet.sql
│   │   │   └── 0005_riders_analytics.sql
│   │   │
│   │   ├── 003_orders/
│   │   │   ├── 0006_orders_core.sql
│   │   │   ├── 0007_orders_service_specific.sql
│   │   │   ├── 0008_orders_providers.sql
│   │   │   └── 0009_orders_relationships.sql
│   │   │
│   │   ├── 004_merchants/
│   │   │   ├── 0010_merchants_core.sql
│   │   │   ├── 0011_merchants_menu.sql
│   │   │   └── 0012_merchants_financial.sql
│   │   │
│   │   ├── 005_customers/
│   │   │   ├── 0013_customers_core.sql
│   │   │   ├── 0014_customers_loyalty.sql
│   │   │   └── 0015_customers_support.sql
│   │   │
│   │   └── 006_access/
│   │       ├── 0016_access_rbac.sql
│   │       ├── 0017_access_controls.sql
│   │       └── 0018_access_audit.sql
│   │
│   ├── seeds/
│   │   ├── 001_riders_seed.sql
│   │   ├── 002_merchants_seed.sql
│   │   └── 003_access_default_roles.sql
│   │
│   └── rollbacks/ (optional)
│       └── ... (rollback scripts)
│
├── src/db/
│   ├── schema/
│   │   ├── riders/
│   │   │   ├── riders.ts
│   │   │   ├── wallet.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── orders/
│   │   │   ├── orders.ts
│   │   │   ├── items.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── merchants/
│   │   ├── customers/
│   │   ├── access/
│   │   └── index.ts (export all)
│   │
│   ├── client.ts (Drizzle client)
│   └── migrate.ts (Migration runner)
│
└── docs/
    ├── schema/
    │   ├── riders/
    │   │   └── riders_domain.md
    │   ├── orders/
    │   │   └── orders_domain.md
    │   └── ... (domain docs)
    └── README.md
```

---

## 🔧 **MIGRATION MANAGEMENT TOOLS**

### **Recommended: Use Drizzle Kit + Custom Script**

#### **1. Install Drizzle Kit:**
```bash
npm install -D drizzle-kit
```

#### **2. Configure Multiple Schema Support:**
```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [
    './src/db/schema/riders/*.ts',
    './src/db/schema/orders/*.ts',
    './src/db/schema/merchants/*.ts',
    './src/db/schema/customers/*.ts',
    './src/db/schema/access/*.ts',
  ],
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Use PostgreSQL schemas
  schemaFilter: ['riders', 'orders', 'merchants', 'customers', 'access_mgmt', 'public'],
});
```

#### **3. Create Migration Runner:**
```typescript
// src/db/migrate.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';

const migrationClient = postgres(process.env.DATABASE_URL!, { max: 1 });

async function runMigrations() {
  console.log('🚀 Starting migrations...');
  
  // Get all migration files
  const migrationsDir = path.join(__dirname, '../../drizzle/migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  console.log(`Found ${files.length} migration files`);
  
  // Run migrations with Drizzle
  const db = drizzle(migrationClient);
  await migrate(db, { migrationsFolder: migrationsDir });
  
  console.log('✅ All migrations completed!');
  
  await migrationClient.end();
}

runMigrations().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
```

---

## 📊 **COMPARISON: Different Approaches**

| Approach | Pros | Cons | Best For |
|----------|------|------|----------|
| **Single DB + Public Schema** | Simple | 178 tables in one namespace | Small projects |
| **Single DB + Multiple Schemas** ⭐ | Organized, maintainable | Slightly complex setup | Large projects (recommended) |
| **Multiple Databases** | Complete isolation | Complex joins, data duplication | Microservices |
| **Sharding** | Horizontal scaling | Very complex | Massive scale (100M+ users) |

---

## 🎯 **RECOMMENDED FOR GATIMITRA**

### **Use PostgreSQL Schemas (Option 1)**

**Why:**
1. **Organization**: 178 tables organized into 5 domains
2. **Maintainability**: Each domain is self-contained
3. **Access Control**: Can grant schema-level permissions
4. **Performance**: No performance penalty
5. **Scalability**: Can move schemas to separate DBs later if needed
6. **Standard Practice**: Industry best practice for large systems

**Implementation:**

1. Create schemas first
2. Organize tables by domain
3. Use `schema.table` notation in queries
4. Set search_path for convenience

---

## 🛠️ **MIGRATION EXECUTION**

### **Recommended Workflow:**

```bash
# 1. Create schemas
psql $DB_URL -f drizzle/migrations/000_schemas/0001_create_schemas.sql

# 2. Create shared enums
psql $DB_URL -f drizzle/migrations/001_shared/0002_shared_enums.sql

# 3. Run domain migrations
psql $DB_URL -f drizzle/migrations/002_riders/0003_riders_core.sql
# ... etc

# OR use a migration tool
npm run migrate
```

---

## 📋 **ACTION ITEMS**

### **What You Should Do:**

1. **Decide on approach:**
   - ✅ **Recommended**: Use PostgreSQL schemas (riders, orders, merchants, customers, access_mgmt)
   - ⚠️ **Alternative**: Keep current prefixing approach

2. **If using PostgreSQL schemas:**
   - Create `0001_create_schemas.sql`
   - Update all migrations to use `schema.table` notation
   - Update Drizzle config
   - Split schema.ts by domain

3. **If keeping current approach:**
   - Just reorganize migration files into folders
   - Keep prefixed table names
   - Easier to implement now

4. **Set up migration tracking:**
   - Use Drizzle Kit migrate
   - Or create schema_migrations table
   - Or use Supabase migrations

---

## ✅ **MY RECOMMENDATION**

### **For Production: Use PostgreSQL Schemas**

**Immediate (Quick Win):**
- Keep current structure (prefixed tables in public schema)
- Organize migration files into folders
- Use migration tracking

**Future (Best Practice):**
- Migrate to PostgreSQL schemas
- Better organization
- Easier maintenance
- Industry standard

**Why:**
- Your system is large (178 tables)
- Clear domain boundaries
- Professional organization
- Easier to scale

---

## 🚀 **SUMMARY**

**Current Status:** 178 tables in public schema with prefixes ✅ WORKS  
**Recommended:** Move to PostgreSQL schemas ✅ BETTER  
**Tools:** Drizzle Kit + custom migration runner ✅ BEST  

**Your schema is production-ready as-is, but organizing into PostgreSQL schemas would be the professional best practice for long-term maintainability.**

---

**Decision:** You choose based on timeline and complexity tolerance.  
**Both approaches are valid** - current works, schemas are better for scale.
