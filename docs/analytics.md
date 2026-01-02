# Analytics Layer Documentation

## Overview

This document describes the analytics layer for the Rider-Based Gig-Economy Logistics Application, including materialized views, aggregation strategies, KPIs, and cron job scheduling.

## Analytics Tables

### 1. Rider Daily Analytics

The `rider_daily_analytics` table stores pre-aggregated daily metrics for each rider, populated via nightly cron jobs.

**Key Metrics**:
- Total orders assigned
- Completed orders
- Cancelled orders
- Acceptance rate
- Total earnings
- Total penalties
- Duty hours
- Average rating

### 2. Materialized Views

#### Rider Leaderboard

```sql
CREATE MATERIALIZED VIEW rider_leaderboard AS
SELECT 
  r.id AS rider_id,
  r.name,
  r.city,
  COALESCE(SUM(wl.amount) FILTER (WHERE wl.entry_type = 'earning'), 0) AS total_earnings,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered') AS completed_orders,
  COALESCE(AVG(rt.rating), 0) AS avg_rating,
  COUNT(DISTINCT o.id) AS total_orders,
  CASE 
    WHEN COUNT(DISTINCT o.id) > 0 
    THEN (COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered')::NUMERIC / 
          COUNT(DISTINCT o.id)::NUMERIC * 100)
    ELSE 0 
  END AS completion_rate
FROM riders r
LEFT JOIN wallet_ledger wl ON r.id = wl.rider_id
LEFT JOIN orders o ON r.id = o.rider_id
LEFT JOIN ratings rt ON r.id = rt.rider_id
WHERE r.status = 'ACTIVE'
GROUP BY r.id, r.name, r.city;

CREATE UNIQUE INDEX rider_leaderboard_rider_id_idx ON rider_leaderboard(rider_id);
CREATE INDEX rider_leaderboard_earnings_idx ON rider_leaderboard(total_earnings DESC);
CREATE INDEX rider_leaderboard_completed_orders_idx ON rider_leaderboard(completed_orders DESC);
```

**Refresh Schedule**: Every 1 hour

#### Rider Performance Summary

```sql
CREATE MATERIALIZED VIEW rider_performance_summary AS
SELECT 
  r.id AS rider_id,
  r.name,
  r.city,
  r.status,
  COUNT(DISTINCT o.id) AS total_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered') AS completed_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'cancelled') AS cancelled_orders,
  COUNT(DISTINCT oa.id) FILTER (WHERE oa.action = 'accept') AS accepted_orders,
  COUNT(DISTINCT oa.id) FILTER (WHERE oa.action = 'reject') AS rejected_orders,
  CASE 
    WHEN COUNT(DISTINCT oa.id) > 0 
    THEN (COUNT(DISTINCT oa.id) FILTER (WHERE oa.action = 'accept')::NUMERIC / 
          COUNT(DISTINCT oa.id)::NUMERIC * 100)
    ELSE 0 
  END AS acceptance_rate,
  CASE 
    WHEN COUNT(DISTINCT o.id) > 0 
    THEN (COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered')::NUMERIC / 
          COUNT(DISTINCT o.id)::NUMERIC * 100)
    ELSE 0 
  END AS completion_rate,
  COALESCE(AVG(rt.rating), 0) AS avg_rating,
  COUNT(DISTINCT rt.id) AS total_ratings,
  COALESCE(SUM(wl.amount) FILTER (WHERE wl.entry_type = 'earning'), 0) AS total_earnings,
  COALESCE(SUM(wl.amount) FILTER (WHERE wl.entry_type = 'penalty'), 0) AS total_penalties,
  COALESCE(SUM(EXTRACT(EPOCH FROM (dl_off.timestamp - dl_on.timestamp)) / 3600), 0) AS duty_hours
FROM riders r
LEFT JOIN orders o ON r.id = o.rider_id
LEFT JOIN order_actions oa ON o.id = oa.order_id AND o.rider_id = oa.rider_id
LEFT JOIN ratings rt ON r.id = rt.rider_id
LEFT JOIN wallet_ledger wl ON r.id = wl.rider_id
LEFT JOIN LATERAL (
  SELECT timestamp FROM duty_logs 
  WHERE rider_id = r.id AND status = 'ON'
  ORDER BY timestamp DESC LIMIT 1
) dl_on ON TRUE
LEFT JOIN LATERAL (
  SELECT timestamp FROM duty_logs 
  WHERE rider_id = r.id AND status = 'OFF'
  ORDER BY timestamp DESC LIMIT 1
) dl_off ON TRUE
WHERE r.status = 'ACTIVE'
GROUP BY r.id, r.name, r.city, r.status;

CREATE UNIQUE INDEX rider_performance_summary_rider_id_idx ON rider_performance_summary(rider_id);
CREATE INDEX rider_performance_summary_city_idx ON rider_performance_summary(city);
CREATE INDEX rider_performance_summary_acceptance_rate_idx ON rider_performance_summary(acceptance_rate DESC);
```

**Refresh Schedule**: Every 6 hours

#### City-Level Analytics

```sql
CREATE MATERIALIZED VIEW city_analytics AS
SELECT 
  r.city,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'ACTIVE') AS active_riders,
  COUNT(DISTINCT o.id) AS total_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered') AS completed_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'cancelled') AS cancelled_orders,
  COALESCE(AVG(o.rider_earning), 0) AS avg_order_earning,
  COALESCE(SUM(o.rider_earning), 0) AS total_earnings,
  COALESCE(AVG(rt.rating), 0) AS avg_rating,
  COUNT(DISTINCT DATE(o.created_at)) AS active_days
FROM riders r
LEFT JOIN orders o ON r.id = o.rider_id
LEFT JOIN ratings rt ON r.id = rt.rider_id
WHERE r.city IS NOT NULL
GROUP BY r.city;

CREATE UNIQUE INDEX city_analytics_city_idx ON city_analytics(city);
```

**Refresh Schedule**: Every 12 hours

## Key Performance Indicators (KPIs)

### Rider-Level KPIs

1. **Acceptance Rate**
   ```sql
   SELECT 
     rider_id,
     (COUNT(*) FILTER (WHERE action = 'accept')::NUMERIC / 
      COUNT(*)::NUMERIC * 100) AS acceptance_rate
   FROM order_actions
   WHERE timestamp > NOW() - INTERVAL '30 days'
   GROUP BY rider_id;
   ```

2. **Completion Rate**
   ```sql
   SELECT 
     rider_id,
     (COUNT(*) FILTER (WHERE status = 'delivered')::NUMERIC / 
      COUNT(*)::NUMERIC * 100) AS completion_rate
   FROM orders
   WHERE created_at > NOW() - INTERVAL '30 days'
   GROUP BY rider_id;
   ```

3. **Average Earnings per Order**
   ```sql
   SELECT 
     rider_id,
     AVG(rider_earning) AS avg_earning_per_order,
     SUM(rider_earning) AS total_earnings
   FROM orders
   WHERE status = 'delivered'
     AND created_at > NOW() - INTERVAL '30 days'
   GROUP BY rider_id;
   ```

4. **Cancellation Rate**
   ```sql
   SELECT 
     rider_id,
     (COUNT(*) FILTER (WHERE status = 'cancelled')::NUMERIC / 
      COUNT(*)::NUMERIC * 100) AS cancellation_rate
   FROM orders
   WHERE created_at > NOW() - INTERVAL '30 days'
   GROUP BY rider_id;
   ```

5. **Penalties Total**
   ```sql
   SELECT 
     rider_id,
     SUM(amount) AS total_penalties
   FROM wallet_ledger
   WHERE entry_type = 'penalty'
     AND created_at > NOW() - INTERVAL '30 days'
   GROUP BY rider_id;
   ```

6. **Duty Hours**
   ```sql
   SELECT 
     rider_id,
     SUM(EXTRACT(EPOCH FROM (off_time - on_time)) / 3600) AS duty_hours
   FROM (
     SELECT 
       rider_id,
       timestamp AS on_time,
       LEAD(timestamp) OVER (PARTITION BY rider_id ORDER BY timestamp) AS off_time
     FROM duty_logs
     WHERE status = 'ON'
       AND timestamp > NOW() - INTERVAL '30 days'
   ) duty_sessions
   WHERE off_time IS NOT NULL
   GROUP BY rider_id;
   ```

### Platform-Level KPIs

1. **Total Active Riders**
   ```sql
   SELECT COUNT(*) FROM riders WHERE status = 'ACTIVE';
   ```

2. **Daily Active Riders (DAU)**
   ```sql
   SELECT 
     DATE(created_at) AS date,
     COUNT(DISTINCT rider_id) AS dau
   FROM duty_logs
   WHERE status = 'ON'
     AND created_at > NOW() - INTERVAL '30 days'
   GROUP BY DATE(created_at);
   ```

3. **Monthly Active Riders (MAU)**
   ```sql
   SELECT COUNT(DISTINCT rider_id) AS mau
   FROM duty_logs
   WHERE status = 'ON'
     AND created_at > NOW() - INTERVAL '30 days';
   ```

4. **Order Volume**
   ```sql
   SELECT 
     DATE(created_at) AS date,
     COUNT(*) AS order_count,
     COUNT(*) FILTER (WHERE status = 'delivered') AS completed_count
   FROM orders
   WHERE created_at > NOW() - INTERVAL '30 days'
   GROUP BY DATE(created_at)
   ORDER BY date DESC;
   ```

5. **Average Order Value**
   ```sql
   SELECT 
     AVG(rider_earning) AS avg_order_value,
     PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rider_earning) AS median_order_value
   FROM orders
   WHERE status = 'delivered'
     AND created_at > NOW() - INTERVAL '30 days';
   ```

6. **Platform Revenue**
   ```sql
   SELECT 
     SUM(commission_amount) AS total_commission,
     SUM(fare_amount) AS total_fare,
     SUM(rider_earning) AS total_rider_earnings
   FROM orders
   WHERE status = 'delivered'
     AND created_at > NOW() - INTERVAL '30 days';
   ```

## Cron Job Scheduling

### Daily Analytics Aggregation

```sql
-- Function to aggregate daily analytics
CREATE OR REPLACE FUNCTION aggregate_daily_analytics(p_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 day')
RETURNS VOID AS $$
BEGIN
  INSERT INTO rider_daily_analytics (
    rider_id,
    date,
    total_orders,
    completed,
    cancelled,
    acceptance_rate,
    earnings_total,
    penalties_total,
    duty_hours,
    avg_rating
  )
  SELECT 
    r.id AS rider_id,
    p_date AS date,
    COUNT(DISTINCT o.id) AS total_orders,
    COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered') AS completed,
    COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'cancelled') AS cancelled,
    CASE 
      WHEN COUNT(DISTINCT oa.id) > 0 
      THEN (COUNT(DISTINCT oa.id) FILTER (WHERE oa.action = 'accept')::NUMERIC / 
            COUNT(DISTINCT oa.id)::NUMERIC * 100)
      ELSE 0 
    END AS acceptance_rate,
    COALESCE(SUM(wl.amount) FILTER (WHERE wl.entry_type = 'earning'), 0) AS earnings_total,
    COALESCE(SUM(wl.amount) FILTER (WHERE wl.entry_type = 'penalty'), 0) AS penalties_total,
    COALESCE(
      SUM(EXTRACT(EPOCH FROM (dl_off.timestamp - dl_on.timestamp)) / 3600), 
      0
    ) AS duty_hours,
    COALESCE(AVG(rt.rating), 0) AS avg_rating
  FROM riders r
  LEFT JOIN orders o ON r.id = o.rider_id 
    AND DATE(o.created_at) = p_date
  LEFT JOIN order_actions oa ON o.id = oa.order_id 
    AND DATE(oa.timestamp) = p_date
  LEFT JOIN wallet_ledger wl ON r.id = wl.rider_id 
    AND DATE(wl.created_at) = p_date
  LEFT JOIN ratings rt ON r.id = rt.rider_id 
    AND DATE(rt.created_at) = p_date
  LEFT JOIN LATERAL (
    SELECT timestamp FROM duty_logs 
    WHERE rider_id = r.id 
      AND status = 'ON'
      AND DATE(timestamp) = p_date
    ORDER BY timestamp ASC LIMIT 1
  ) dl_on ON TRUE
  LEFT JOIN LATERAL (
    SELECT timestamp FROM duty_logs 
    WHERE rider_id = r.id 
      AND status = 'OFF'
      AND DATE(timestamp) = p_date
    ORDER BY timestamp DESC LIMIT 1
  ) dl_off ON TRUE
  WHERE r.status = 'ACTIVE'
  GROUP BY r.id
  ON CONFLICT (rider_id, date) 
  DO UPDATE SET
    total_orders = EXCLUDED.total_orders,
    completed = EXCLUDED.completed,
    cancelled = EXCLUDED.cancelled,
    acceptance_rate = EXCLUDED.acceptance_rate,
    earnings_total = EXCLUDED.earnings_total,
    penalties_total = EXCLUDED.penalties_total,
    duty_hours = EXCLUDED.duty_hours,
    avg_rating = EXCLUDED.avg_rating;
END;
$$ LANGUAGE plpgsql;
```

### Cron Job Configuration

#### Using pg_cron (PostgreSQL Extension)

```sql
-- Schedule daily analytics aggregation (runs at 2 AM daily)
SELECT cron.schedule(
  'daily-analytics-aggregation',
  '0 2 * * *',
  $$SELECT aggregate_daily_analytics(CURRENT_DATE - INTERVAL '1 day');$$
);

-- Schedule leaderboard refresh (every hour)
SELECT cron.schedule(
  'refresh-leaderboard',
  '0 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY rider_leaderboard;$$
);

-- Schedule performance summary refresh (every 6 hours)
SELECT cron.schedule(
  'refresh-performance-summary',
  '0 */6 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY rider_performance_summary;$$
);

-- Schedule city analytics refresh (every 12 hours)
SELECT cron.schedule(
  'refresh-city-analytics',
  '0 */12 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY city_analytics;$$
);
```

#### Using External Cron (Node.js/TypeScript)

```typescript
import cron from 'node-cron';
import { db } from './db';
import { sql } from 'drizzle-orm';

// Daily analytics aggregation at 2 AM
cron.schedule('0 2 * * *', async () => {
  console.log('Running daily analytics aggregation...');
  await db.execute(
    sql`SELECT aggregate_daily_analytics(CURRENT_DATE - INTERVAL '1 day')`
  );
});

// Refresh leaderboard every hour
cron.schedule('0 * * * *', async () => {
  console.log('Refreshing leaderboard...');
  await db.execute(
    sql`REFRESH MATERIALIZED VIEW CONCURRENTLY rider_leaderboard`
  );
});

// Refresh performance summary every 6 hours
cron.schedule('0 */6 * * *', async () => {
  console.log('Refreshing performance summary...');
  await db.execute(
    sql`REFRESH MATERIALIZED VIEW CONCURRENTLY rider_performance_summary`
  );
});
```

## Reporting Queries

### Rider Performance Report

```sql
SELECT 
  r.id,
  r.name,
  r.city,
  rda.date,
  rda.total_orders,
  rda.completed,
  rda.cancelled,
  rda.acceptance_rate,
  rda.earnings_total,
  rda.penalties_total,
  rda.duty_hours,
  rda.avg_rating
FROM rider_daily_analytics rda
JOIN riders r ON rda.rider_id = r.id
WHERE rda.date >= CURRENT_DATE - INTERVAL '30 days'
  AND r.id = :rider_id
ORDER BY rda.date DESC;
```

### City Performance Report

```sql
SELECT 
  city,
  SUM(active_riders) AS total_active_riders,
  SUM(total_orders) AS total_orders,
  SUM(completed_orders) AS completed_orders,
  AVG(avg_rating) AS avg_rating,
  SUM(total_earnings) AS total_earnings
FROM city_analytics
GROUP BY city
ORDER BY total_orders DESC;
```

### Top Performers Report

```sql
SELECT 
  rider_id,
  name,
  city,
  total_earnings,
  completed_orders,
  avg_rating,
  acceptance_rate
FROM rider_leaderboard
ORDER BY total_earnings DESC
LIMIT 100;
```

## Data Retention & Archival

### Analytics Data Retention

- **Daily Analytics**: Retain for 2 years
- **Materialized Views**: Keep current data only
- **Raw Data**: Archive after 1 year

### Archival Script

```sql
-- Archive old daily analytics (older than 2 years)
CREATE OR REPLACE FUNCTION archive_old_analytics()
RETURNS VOID AS $$
BEGIN
  DELETE FROM rider_daily_analytics
  WHERE date < CURRENT_DATE - INTERVAL '2 years';
END;
$$ LANGUAGE plpgsql;

-- Schedule archival (monthly)
SELECT cron.schedule(
  'archive-old-analytics',
  '0 3 1 * *',
  $$SELECT archive_old_analytics();$$
);
```

This analytics layer provides comprehensive insights into rider performance, platform metrics, and business KPIs, enabling data-driven decision making.
