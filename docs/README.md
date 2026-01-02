# Enterprise-Grade DBMS Architecture Documentation

## Rider-Based Gig-Economy Logistics Application

Complete database architecture and schema for a scalable rider-based logistics platform (similar to Swiggy, Rapido, UberEats, Dunzo).

---

## 📚 Documentation Index

### Core Documentation

1. **[ERD (Entity Relationship Diagram)](./erd.md)**
   - Complete database schema visualization
   - Mermaid ERD diagram
   - Table relationships and domain groups

2. **[Scaling Strategy](./scaling.md)**
   - Partitioning strategy
   - Indexing recommendations
   - Materialized views
   - Redis caching
   - Performance optimization
   - Backup & recovery

3. **[API Integration Guide](./api-integration.md)**
   - Database connection setup
   - Transaction handling
   - RPC functions
   - Row-Level Security (RLS)
   - Caching strategies
   - Query patterns

4. **[Fraud & Security](./fraud-security.md)**
   - Fraud detection mechanisms
   - Device restrictions
   - Duplicate account prevention
   - Location spoofing detection
   - Payment fraud detection
   - Blacklist/whitelist management

5. **[Analytics Layer](./analytics.md)**
   - Materialized views
   - KPI definitions
   - Cron job scheduling
   - Reporting queries
   - Data retention

---

## 🏗️ Architecture Overview

### Design Principles

1. **Modular Monolithic Schema**: Domain-based table groups for maintainability
2. **Integer Rider IDs**: Auto-incrementing integer primary keys (no characters)
3. **Event Sourcing**: Comprehensive event logging for audit trails
4. **Partitioning Ready**: High-volume tables designed for partitioning
5. **Read Optimization**: Materialized views and aggregates for analytics

### Storage Strategy

| Data Type | Storage Solution |
|-----------|-----------------|
| Core business data | PostgreSQL tables |
| Media files (PAN, Aadhaar, DL, RC, selfie) | Supabase Storage buckets |
| Location logs | Partitioned PostgreSQL tables |
| Analytics aggregates | Materialized views |
| Real-time cache | Redis (optional) |

---

## 📊 Database Schema

### Table Groups

#### 1. Rider Core Domain
- `riders` - Core rider information (INTEGER id)
- `rider_documents` - Document history with reupload support
- `blacklist_history` - Audit trail for blacklisting

#### 2. Device & Security
- `rider_devices` - Device tracking and management
- `fraud_logs` - Fraud detection events
- `admin_action_logs` - Admin action audit trail

#### 3. Duty & Activity
- `duty_logs` - ON/OFF duty status changes
- `location_logs` - Time-series location data (partitioned)

#### 4. Orders & Events
- `orders` - Multi-category orders (food, parcel, ride, 3pl)
- `order_actions` - Accept/reject decisions
- `order_events` - Comprehensive order timeline

#### 5. Wallet & Finance
- `wallet_ledger` - Immutable transaction log (partitioned)
- `withdrawal_requests` - Withdrawal management
- `onboarding_payments` - Registration fee payments

#### 6. Offers & Rewards
- `offers` - Campaign offers
- `offer_participation` - Rider participation tracking

#### 7. Ratings & Reviews
- `ratings` - Customer/merchant ratings

#### 8. Support & Tickets
- `tickets` - Support ticket system

#### 9. Referral System
- `referrals` - Referral tracking and rewards

#### 10. Analytics
- `rider_daily_analytics` - Pre-aggregated daily metrics

---

## 🚀 Quick Start

### 1. Database Setup

```bash
# Install dependencies
cd backend
npm install

# Set up environment variables
cp env.example .env
# Edit .env with your Supabase credentials

# Generate migration
npm run db:generate

# Apply migration
npm run db:push
```

### 2. Environment Variables

```env
DATABASE_URL=postgresql://user:password@host:5432/database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
REDIS_URL=redis://localhost:6379 (optional)
```

### 3. Verify Schema

```sql
-- Check all tables are created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check rider table structure
\d riders
```

---

## 🔑 Key Features

### 1. Integer Rider IDs

- **Primary Key**: `INTEGER` with `GENERATED ALWAYS AS IDENTITY`
- **Unique**: No characters, pure numeric IDs
- **Auto-incrementing**: Database-managed sequence

### 2. Comprehensive Event Logging

- Order events for complete timeline
- Duty logs for activity tracking
- Admin action logs for audit compliance
- Fraud logs for security monitoring

### 3. Partitioning Strategy

- **Location Logs**: Monthly partitions
- **Wallet Ledger**: Hash partitioning by rider_id
- **Future**: Orders table monthly partitioning

### 4. Materialized Views

- Rider leaderboard (refreshed hourly)
- Performance summary (refreshed every 6 hours)
- City analytics (refreshed every 12 hours)

### 5. Row-Level Security (RLS)

- Riders can only access their own data
- Admin policies for elevated access
- System operations via service accounts

---

## 📈 Scaling Recommendations

### Stage 1: 0-10K Riders
- Single PostgreSQL instance
- Basic indexing
- Optional Redis cache

### Stage 2: 10K-100K Riders
- Implement location_logs partitioning
- Add Redis caching
- Enable read replicas
- Implement materialized views

### Stage 3: 100K-1M Riders
- Partition wallet_ledger
- Partition orders table
- Connection pooling
- Archive old partitions

### Stage 4: 1M+ Riders
- Consider sharding by city/region
- Distributed caching
- Time-series database for location logs
- Separate analytics database

---

## 🔒 Security Features

1. **Fraud Detection**
   - Location spoofing detection
   - Duplicate account prevention
   - Device restrictions
   - Payment fraud monitoring

2. **Data Integrity**
   - Foreign key constraints
   - Unique constraints
   - Check constraints
   - Transaction isolation

3. **Access Control**
   - Row-Level Security (RLS)
   - Role-based access
   - Audit logging

---

## 📊 Analytics & Reporting

### Key Performance Indicators

- **Rider Level**: Acceptance rate, completion rate, earnings, duty hours
- **Platform Level**: DAU, MAU, order volume, revenue
- **City Level**: Active riders, order completion, average ratings

### Pre-built Reports

- Rider performance report
- City performance report
- Top performers leaderboard
- Daily analytics aggregation

---

## 🛠️ Maintenance

### Daily Tasks

- Analytics aggregation (2 AM)
- Materialized view refresh (hourly/6-hourly)

### Weekly Tasks

- Performance monitoring
- Index maintenance
- Cache optimization

### Monthly Tasks

- Partition archival
- Data retention cleanup
- Performance review

---

## 📝 Migration Guide

### Applying Migrations

```bash
# Generate new migration
npm run db:generate

# Review generated SQL
cat drizzle/0002_enterprise_rider_schema.sql

# Apply to database
npm run db:push

# Or use Supabase CLI
supabase db push
```

### Rollback Strategy

```sql
-- Manual rollback (if needed)
BEGIN;
-- Drop tables in reverse order
DROP TABLE IF EXISTS admin_action_logs CASCADE;
DROP TABLE IF EXISTS fraud_logs CASCADE;
-- ... (continue for all tables)
ROLLBACK; -- or COMMIT;
```

---

## 🧪 Testing

### Schema Validation

```sql
-- Verify all tables exist
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public';

-- Verify indexes
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Verify constraints
SELECT conname, contype, conrelid::regclass
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace;
```

---

## 📞 Support & Resources

### Documentation Files

- `erd.md` - Entity Relationship Diagram
- `scaling.md` - Scaling strategy and performance
- `api-integration.md` - Backend integration guide
- `fraud-security.md` - Security and fraud detection
- `analytics.md` - Analytics layer documentation

### Database Files

- `backend/src/db/schema.ts` - Drizzle ORM schema
- `backend/drizzle/0002_enterprise_rider_schema.sql` - SQL migration
- `backend/drizzle.config.ts` - Drizzle configuration

---

## 🎯 Next Steps

1. **Review Schema**: Check `backend/src/db/schema.ts`
2. **Apply Migration**: Run `npm run db:push`
3. **Set Up RLS**: Configure Row-Level Security policies
4. **Implement RPC Functions**: Create database functions for complex operations
5. **Set Up Cron Jobs**: Schedule analytics aggregation
6. **Configure Redis**: Set up caching layer (optional)
7. **Monitor Performance**: Set up query monitoring

---

## 📄 License

This schema is designed for enterprise use. Customize as needed for your specific requirements.

---

**Last Updated**: 2025-01-XX
**Version**: 1.0.0
**Database**: Supabase PostgreSQL
**ORM**: Drizzle
