# Scaling Strategy & Performance Optimization

## Architecture Overview

This document outlines the scaling strategy for the Rider-Based Gig-Economy Logistics Application database architecture.

## Storage Strategy

### PostgreSQL Tables (Core Business Data)
- **Rider identity and profile data**
- **Orders and transactions**
- **Wallet ledger entries**
- **Ratings and reviews**
- **Support tickets**

### Supabase Storage Buckets (Media Files)
- **PAN card images**: `pan-documents`
- **Aadhaar card images**: `aadhaar-documents`
- **Driving License images**: `dl-documents`
- **RC (Registration Certificate) images**: `rc-documents`
- **Selfie images**: `selfie-images`
- **Rental/EV proof documents**: `proof-documents`

**Storage URL Pattern**: `https://[project].supabase.co/storage/v1/object/public/[bucket]/[rider_id]/[document_type]/[filename]`

### Redis Cache (Optional but Recommended)
- **Rider duty status** (ON/OFF) - TTL: 5 minutes
- **Wallet balance** (computed from ledger) - TTL: 1 minute
- **Active rider pools by city** - TTL: 30 seconds
- **Order assignment queue** - TTL: Real-time
- **Rider location cache** (last known location) - TTL: 1 minute

### Event Log Tables (Time-Series Data)
- **Location logs**: Partitioned by month
- **Order events**: Indexed by order_id and timestamp
- **Duty logs**: Indexed by rider_id and timestamp

## Partitioning Strategy

### 1. Location Logs (Monthly Partitioning)

```sql
-- Create monthly partitions for location_logs
CREATE TABLE location_logs_y2025m01 PARTITION OF location_logs
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE location_logs_y2025m02 PARTITION OF location_logs
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- Automated partition creation function
CREATE OR REPLACE FUNCTION create_location_logs_partition(month_date DATE)
RETURNS VOID AS $$
DECLARE
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
BEGIN
  start_date := date_trunc('month', month_date);
  end_date := start_date + INTERVAL '1 month';
  partition_name := 'location_logs_y' || to_char(start_date, 'YYYY') || 
                    'm' || lpad(to_char(start_date, 'MM'), 2, '0');
  
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF location_logs
                  FOR VALUES FROM (%L) TO (%L)',
                  partition_name, start_date, end_date);
END;
$$ LANGUAGE plpgsql;
```

**Archival Strategy**: Archive partitions older than 6 months to cold storage (S3/Cloud Storage)

### 2. Wallet Ledger (Hash Partitioning)

```sql
-- Partition by rider_id hash (4 partitions)
CREATE TABLE wallet_ledger_0 PARTITION OF wallet_ledger 
  FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE wallet_ledger_1 PARTITION OF wallet_ledger 
  FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE wallet_ledger_2 PARTITION OF wallet_ledger 
  FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE wallet_ledger_3 PARTITION OF wallet_ledger 
  FOR VALUES WITH (MODULUS 4, REMAINDER 3);
```

**Scaling**: Add more partitions as volume grows (8, 16, 32, etc.)

### 3. Orders Table (Future: Monthly Partitioning)

For high-volume scenarios (>1M orders/month), consider partitioning:

```sql
-- Future implementation
CREATE TABLE orders_y2025m01 PARTITION OF orders
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

## Indexing Strategy

### Critical Indexes (Already Implemented)

1. **Rider Lookups**
   - `riders.mobile` (UNIQUE)
   - `riders.status` + `riders.city` (composite for active rider queries)
   - `riders.kyc_status` (for approval workflows)

2. **Order Queries**
   - `orders.rider_id` + `orders.status` (composite)
   - `orders.created_at` (for time-range queries)
   - `orders.external_ref` (for 3PL integrations)

3. **Wallet Operations**
   - `wallet_ledger.rider_id` + `wallet_ledger.created_at` (composite)
   - `wallet_ledger.entry_type` (for filtering)

4. **Location Tracking**
   - `location_logs.rider_id` + `location_logs.created_at` (composite)
   - Partition pruning automatically handles time-based queries

### Additional Recommended Indexes

```sql
-- Partial indexes for active riders
CREATE INDEX idx_riders_active_city 
  ON riders(city) 
  WHERE status = 'ACTIVE' AND kyc_status = 'APPROVED';

-- Partial index for pending withdrawals
CREATE INDEX idx_withdrawal_requests_pending 
  ON withdrawal_requests(created_at) 
  WHERE status = 'pending';

-- GIN index for JSONB metadata searches
CREATE INDEX idx_orders_metadata_gin ON orders USING GIN (metadata);
CREATE INDEX idx_wallet_ledger_metadata_gin ON wallet_ledger USING GIN (metadata);
```

## Materialized Views

### 1. Rider Leaderboard

```sql
CREATE MATERIALIZED VIEW rider_leaderboard AS
SELECT 
  r.id AS rider_id,
  r.name,
  r.city,
  COALESCE(SUM(wl.amount) FILTER (WHERE wl.entry_type = 'earning'), 0) AS total_earnings,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered') AS completed_orders,
  COALESCE(AVG(rt.rating), 0) AS avg_rating
FROM riders r
LEFT JOIN wallet_ledger wl ON r.id = wl.rider_id
LEFT JOIN orders o ON r.id = o.rider_id
LEFT JOIN ratings rt ON r.id = rt.rider_id
WHERE r.status = 'ACTIVE'
GROUP BY r.id, r.name, r.city;

-- Refresh strategy: Every 1 hour
CREATE UNIQUE INDEX rider_leaderboard_rider_id_idx ON rider_leaderboard(rider_id);
CREATE INDEX rider_leaderboard_earnings_idx ON rider_leaderboard(total_earnings DESC);
```

**Refresh Schedule**: Every 1 hour via cron job

### 2. Rider Performance Summary

```sql
CREATE MATERIALIZED VIEW rider_performance_summary AS
SELECT 
  r.id AS rider_id,
  r.name,
  r.city,
  COUNT(DISTINCT o.id) AS total_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered') AS completed_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'cancelled') AS cancelled_orders,
  -- ... (see migration file for full query)
FROM riders r
-- ... joins
GROUP BY r.id, r.name, r.city;
```

**Refresh Schedule**: Every 6 hours

## Redis Caching Strategy

### Cache Keys Pattern

```typescript
// Rider duty status
`rider:duty:${riderId}` → "ON" | "OFF" | "AUTO_OFF" (TTL: 5 min)

// Wallet balance (computed)
`rider:wallet:balance:${riderId}` → number (TTL: 1 min)

// Active riders by city
`riders:active:city:${city}` → Set<riderId> (TTL: 30 sec)

// Last known location
`rider:location:${riderId}` → {lat, lon, timestamp} (TTL: 1 min)

// Order assignment queue
`orders:queue:${city}` → List<orderId> (TTL: Real-time)
```

### Cache Invalidation

- **Wallet balance**: Invalidate on any `wallet_ledger` insert
- **Duty status**: Invalidate on `duty_logs` insert
- **Active riders**: Invalidate on duty status change or rider status change
- **Location**: Auto-expire after 1 minute (always fresh)

## Time-Series Archiving

### Archival Process

1. **Location Logs**: Archive partitions older than 6 months
2. **Order Events**: Archive events older than 1 year
3. **Duty Logs**: Archive logs older than 1 year

### Archival Script (Example)

```sql
-- Archive old location logs to S3/Cloud Storage
-- Run monthly via cron

CREATE OR REPLACE FUNCTION archive_old_location_logs()
RETURNS VOID AS $$
DECLARE
  old_partition TEXT;
  archive_date DATE;
BEGIN
  archive_date := CURRENT_DATE - INTERVAL '6 months';
  old_partition := 'location_logs_y' || 
                   to_char(archive_date, 'YYYY') || 
                   'm' || lpad(to_char(archive_date, 'MM'), 2, '0');
  
  -- Export to CSV/S3 (implementation depends on your storage)
  -- Then drop partition
  EXECUTE format('DROP TABLE IF EXISTS %I', old_partition);
END;
$$ LANGUAGE plpgsql;
```

## High Read/Write API Considerations

### Read Optimization

1. **Use Materialized Views** for dashboard/analytics queries
2. **Cache frequently accessed data** in Redis
3. **Use read replicas** for analytics queries (Supabase supports this)
4. **Connection pooling** (PgBouncer recommended)

### Write Optimization

1. **Batch inserts** for location logs (buffer and insert in batches)
2. **Async processing** for analytics aggregation
3. **Use transactions** for multi-table operations (wallet updates, order status changes)
4. **Queue-based processing** for non-critical writes (ratings, tickets)

### Example: Batch Location Insert

```typescript
// Buffer location updates and insert in batches
const locationBuffer: LocationLog[] = [];

// Every 5 seconds or 100 items, flush to DB
setInterval(() => {
  if (locationBuffer.length > 0) {
    await db.insert(locationLogs).values(locationBuffer);
    locationBuffer.length = 0;
  }
}, 5000);
```

## Performance Monitoring

### Key Metrics to Monitor

1. **Query Performance**
   - Slow query log (>100ms)
   - Index usage statistics
   - Table scan frequency

2. **Connection Pool**
   - Active connections
   - Idle connections
   - Connection wait time

3. **Partition Health**
   - Partition size
   - Query performance on partitions
   - Archival success rate

4. **Cache Hit Rate**
   - Redis cache hit ratio (target: >80%)
   - Cache eviction rate

### Monitoring Queries

```sql
-- Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC;

-- Partition sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'location_logs%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## Backup & Recovery Strategy

### Backup Schedule

1. **Full Backup**: Daily at 2 AM UTC
2. **Incremental Backup**: Every 6 hours
3. **Transaction Log Backup**: Continuous (WAL archiving)

### Recovery Point Objective (RPO)
- **Target**: 1 hour (maximum data loss)
- **Actual**: 6 hours (incremental backup interval)

### Recovery Time Objective (RTO)
- **Target**: 4 hours (time to restore)
- **Strategy**: Point-in-time recovery (PITR) using WAL

### Supabase Backup

Supabase provides automated backups:
- Daily backups retained for 7 days
- Weekly backups retained for 4 weeks
- Manual backup before major migrations

## Scaling Recommendations by Growth Stage

### Stage 1: 0-10K Riders
- Single PostgreSQL instance
- No partitioning needed
- Basic indexing
- Optional Redis cache

### Stage 2: 10K-100K Riders
- Implement location_logs partitioning
- Add Redis caching
- Enable read replicas for analytics
- Implement materialized views

### Stage 3: 100K-1M Riders
- Partition wallet_ledger
- Partition orders table
- Implement connection pooling
- Add more materialized views
- Archive old partitions

### Stage 4: 1M+ Riders
- Consider sharding by city/region
- Implement distributed caching
- Use time-series database for location logs (TimescaleDB)
- Separate analytics database (data warehouse)

## Conclusion

This architecture is designed to scale from startup to enterprise level. The modular design allows incremental optimization as traffic grows. Key principles:

1. **Partition early** for high-volume tables
2. **Cache aggressively** for frequently accessed data
3. **Materialize** expensive aggregations
4. **Archive** old data to reduce table bloat
5. **Monitor** performance metrics continuously
