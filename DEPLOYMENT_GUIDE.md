# 🚀 Deployment Guide - Enterprise Rider DBMS

## ✅ What Has Been Created

### 1. Database Schema Files

#### Drizzle ORM Schema
- **Location**: `backend/src/db/schema.ts`
- **Content**: Complete TypeScript schema with all 20+ tables
- **Features**: 
  - INTEGER rider_id (auto-incrementing)
  - All enums defined
  - Relations configured
  - Indexes defined

#### SQL Migration File
- **Location**: `backend/drizzle/0002_enterprise_rider_schema.sql`
- **Content**: Complete SQL migration for Supabase PostgreSQL
- **Features**:
  - All tables with proper constraints
  - Indexes and unique constraints
  - Partitioning setup
  - Materialized views
  - RLS policies (commented, needs configuration)
  - Triggers for updated_at

### 2. Documentation Files

#### Core Documentation
- **`docs/README.md`** - Main documentation index
- **`docs/erd.md`** - Entity Relationship Diagram (Mermaid)
- **`docs/scaling.md`** - Scaling strategy and performance optimization
- **`docs/api-integration.md`** - Backend API integration guide
- **`docs/fraud-security.md`** - Fraud detection and security
- **`docs/analytics.md`** - Analytics layer and KPIs

#### Quick Reference
- **`backend/README_DB.md`** - Quick reference guide

---

## 📋 Pre-Deployment Checklist

### 1. Environment Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies (if not already done)
npm install

# Verify Drizzle is installed
npm list drizzle-orm drizzle-kit
```

### 2. Database Connection

Create/update `.env` file:

```env
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT].supabase.co:5432/postgres
SUPABASE_URL=https://[YOUR-PROJECT].supabase.co
SUPABASE_ANON_KEY=[YOUR-ANON-KEY]
SUPABASE_SERVICE_ROLE_KEY=[YOUR-SERVICE-ROLE-KEY]

# Optional: Redis for caching
REDIS_URL=redis://localhost:6379
```

### 3. Review Schema

Before deploying, review the schema:

```bash
# Open schema file
code backend/src/db/schema.ts

# Review migration SQL
code backend/drizzle/0002_enterprise_rider_schema.sql
```

**Key Points to Verify**:
- ✅ Rider ID is INTEGER (not UUID)
- ✅ All required tables are present
- ✅ Foreign key relationships are correct
- ✅ Indexes are appropriate for your use case

---

## 🚀 Deployment Steps

### Option 1: Using Drizzle Push (Recommended for Development)

```bash
cd backend

# Generate migration from schema
npm run db:generate

# Push schema to database (creates tables)
npm run db:push
```

**Note**: This will create all tables directly. Use for development/testing.

### Option 2: Using SQL Migration (Recommended for Production)

```bash
cd backend

# Connect to Supabase database
# Option A: Using Supabase CLI
supabase db push

# Option B: Using psql
psql $DATABASE_URL -f drizzle/0002_enterprise_rider_schema.sql

# Option C: Using Supabase Dashboard
# 1. Go to Supabase Dashboard > SQL Editor
# 2. Copy contents of drizzle/0002_enterprise_rider_schema.sql
# 3. Paste and execute
```

### Option 3: Manual Step-by-Step (For Production)

1. **Create Enums First**:
   ```sql
   -- Run enum creation statements from migration file
   -- (Lines starting with CREATE TYPE)
   ```

2. **Create Tables**:
   ```sql
   -- Run table creation statements
   -- (In dependency order: riders first, then dependent tables)
   ```

3. **Create Indexes**:
   ```sql
   -- Indexes are created automatically in migration
   -- But verify they exist
   ```

4. **Create Functions & Triggers**:
   ```sql
   -- Run function and trigger creation statements
   ```

5. **Create Materialized Views**:
   ```sql
   -- Create materialized views for analytics
   ```

---

## ✅ Post-Deployment Verification

### 1. Verify Tables Created

```sql
-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Expected: ~20 tables including:
-- riders, rider_documents, orders, wallet_ledger, etc.
```

### 2. Verify Rider Table Structure

```sql
-- Check riders table has INTEGER id
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'riders'
ORDER BY ordinal_position;

-- Verify: id should be INTEGER with GENERATED ALWAYS AS IDENTITY
```

### 3. Verify Indexes

```sql
-- Check critical indexes
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('riders', 'orders', 'wallet_ledger')
ORDER BY tablename, indexname;
```

### 4. Verify Constraints

```sql
-- Check foreign keys
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;
```

### 5. Test Basic Operations

```sql
-- Test insert (should work)
INSERT INTO riders (mobile, country_code, name)
VALUES ('+919876543210', '+91', 'Test Rider')
RETURNING id;

-- Verify: id should be INTEGER (1, 2, 3, etc.)

-- Test foreign key (should work)
INSERT INTO rider_documents (rider_id, doc_type, file_url)
VALUES (1, 'aadhaar', 'https://example.com/doc.pdf')
RETURNING id;

-- Cleanup test data
DELETE FROM rider_documents WHERE rider_id = 1;
DELETE FROM riders WHERE id = 1;
```

---

## 🔧 Configuration Steps

### 1. Configure Row-Level Security (RLS)

The migration includes RLS enablement but policies need to be configured based on your auth system.

**Example Policy** (adjust for your auth):

```sql
-- Enable RLS
ALTER TABLE riders ENABLE ROW LEVEL SECURITY;

-- Create policy (example - adjust based on your auth)
CREATE POLICY "riders_select_own" ON riders
  FOR SELECT
  USING (id = current_setting('app.current_rider_id', TRUE)::INTEGER);
```

**See**: `docs/api-integration.md` for detailed RLS setup

### 2. Set Up Storage Buckets (Supabase)

Create storage buckets for documents:

```sql
-- Using Supabase Dashboard or API
-- Buckets needed:
-- - pan-documents
-- - aadhaar-documents
-- - dl-documents
-- - rc-documents
-- - selfie-images
-- - proof-documents
```

### 3. Configure Cron Jobs (Optional)

For analytics aggregation:

```sql
-- Install pg_cron extension (if available)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily analytics
SELECT cron.schedule(
  'daily-analytics',
  '0 2 * * *',
  $$SELECT aggregate_daily_analytics(CURRENT_DATE - INTERVAL '1 day');$$
);
```

**Or use external cron** (Node.js):

```typescript
// See docs/analytics.md for cron setup
```

### 4. Set Up Redis Cache (Optional)

```bash
# Install Redis
# Configure connection in .env
REDIS_URL=redis://localhost:6379

# See docs/api-integration.md for cache implementation
```

---

## 📊 Next Steps

### Immediate Actions

1. ✅ **Deploy Schema**: Run migration
2. ✅ **Verify Tables**: Check all tables created
3. ✅ **Test Inserts**: Verify INTEGER rider_id works
4. ⚙️ **Configure RLS**: Set up Row-Level Security
5. ⚙️ **Create Storage Buckets**: Set up document storage

### Short Term (Week 1)

1. **Implement RPC Functions**: Create database functions for complex operations
2. **Set Up Analytics**: Configure materialized view refresh
3. **Configure Caching**: Set up Redis (if using)
4. **Test API Integration**: Connect backend APIs

### Medium Term (Month 1)

1. **Monitor Performance**: Set up query monitoring
2. **Optimize Indexes**: Based on actual query patterns
3. **Set Up Partitions**: Create monthly partitions for location_logs
4. **Implement Archival**: Set up old data archival

### Long Term (Quarter 1)

1. **Scale Infrastructure**: Add read replicas if needed
2. **Implement Sharding**: If volume exceeds 1M riders
3. **Advanced Analytics**: Set up data warehouse
4. **Security Hardening**: Implement advanced fraud detection

---

## 🐛 Troubleshooting

### Issue: Migration Fails

**Error**: `relation "riders" already exists`

**Solution**: 
```sql
-- Drop existing tables (CAUTION: Data loss)
DROP TABLE IF EXISTS riders CASCADE;
-- Then re-run migration
```

### Issue: Rider ID Not Integer

**Error**: `column "id" is of type text but expression is of type integer`

**Solution**: Verify schema uses `integer("id")` not `text("id")`

### Issue: Foreign Key Violation

**Error**: `insert or update on table "orders" violates foreign key constraint`

**Solution**: Ensure referenced rider exists:
```sql
SELECT id FROM riders WHERE id = [rider_id];
```

### Issue: Partition Not Found

**Error**: `relation "location_logs_y2025m01" does not exist`

**Solution**: Create partition manually:
```sql
CREATE TABLE location_logs_y2025m01 PARTITION OF location_logs
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

---

## 📞 Support Resources

### Documentation
- **Full Docs**: `/docs/README.md`
- **ERD**: `/docs/erd.md`
- **Scaling**: `/docs/scaling.md`
- **API Guide**: `/docs/api-integration.md`
- **Security**: `/docs/fraud-security.md`
- **Analytics**: `/docs/analytics.md`

### Code Files
- **Schema**: `backend/src/db/schema.ts`
- **Migration**: `backend/drizzle/0002_enterprise_rider_schema.sql`
- **Config**: `backend/drizzle.config.ts`

---

## ✅ Deployment Checklist

- [ ] Environment variables configured
- [ ] Database connection tested
- [ ] Schema reviewed
- [ ] Migration executed
- [ ] Tables verified
- [ ] Indexes verified
- [ ] Constraints verified
- [ ] Test inserts successful
- [ ] RLS configured
- [ ] Storage buckets created
- [ ] Cron jobs configured (optional)
- [ ] Redis configured (optional)
- [ ] Monitoring set up

---

## 🎉 Success Criteria

Your deployment is successful when:

1. ✅ All 20+ tables are created
2. ✅ Rider IDs are INTEGER and auto-incrementing
3. ✅ Foreign keys work correctly
4. ✅ Indexes are created
5. ✅ Materialized views exist
6. ✅ Test inserts succeed
7. ✅ RLS is configured (if using)
8. ✅ Documentation is accessible

---

**Ready to deploy?** Start with Step 1 in "Deployment Steps" section above!

**Questions?** Check the documentation in `/docs` folder or review the schema files.
