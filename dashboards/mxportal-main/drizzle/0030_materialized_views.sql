-- ============================================================================
-- MATERIALIZED VIEWS FOR ANALYTICS
-- Migration: 0030_materialized_views
-- Database: Supabase PostgreSQL
-- 
-- This file creates materialized views for analytics and reporting
-- ============================================================================

-- ============================================================================
-- PROVIDER PERFORMANCE SUMMARY
-- ============================================================================

-- Note: Using DROP IF EXISTS for idempotency (PostgreSQL 9.5+ supports IF NOT EXISTS for materialized views, but this is safer)
DROP MATERIALIZED VIEW IF EXISTS provider_performance_summary;
CREATE MATERIALIZED VIEW provider_performance_summary AS
SELECT 
  o.source AS provider_type,
  o.order_type,
  COUNT(*) AS total_orders,
  COUNT(*) FILTER (WHERE o.status = 'delivered') AS completed_orders,
  COUNT(*) FILTER (WHERE o.status = 'cancelled') AS cancelled_orders,
  AVG(EXTRACT(EPOCH FROM (o.actual_delivery_time - o.actual_pickup_time))/60) AS avg_delivery_time_minutes,
  AVG(o.fare_amount) AS avg_fare_amount,
  SUM(o.fare_amount) AS total_fare_amount,
  SUM(o.commission_amount) AS total_commission,
  SUM(o.rider_earning) AS total_rider_earning,
  COUNT(*) FILTER (WHERE o.synced_with_provider = TRUE) AS synced_orders,
  COUNT(*) FILTER (WHERE o.synced_with_provider = FALSE) AS unsynced_orders
FROM orders o
WHERE o.source != 'internal'
GROUP BY o.source, o.order_type;

CREATE UNIQUE INDEX IF NOT EXISTS provider_performance_summary_pkey 
  ON provider_performance_summary(provider_type, order_type);

-- ============================================================================
-- ORDER SOURCE DISTRIBUTION
-- ============================================================================

-- Note: Using DROP IF EXISTS for idempotency
DROP MATERIALIZED VIEW IF EXISTS order_source_distribution;
CREATE MATERIALIZED VIEW order_source_distribution AS
SELECT 
  o.source,
  o.order_type,
  DATE_TRUNC('day', o.created_at) AS order_date,
  COUNT(*) AS order_count,
  SUM(o.fare_amount) AS total_revenue,
  AVG(o.fare_amount) AS avg_order_value
FROM orders o
GROUP BY o.source, o.order_type, DATE_TRUNC('day', o.created_at);

CREATE UNIQUE INDEX IF NOT EXISTS order_source_distribution_pkey 
  ON order_source_distribution(source, order_type, order_date);

-- ============================================================================
-- RIDER PERFORMANCE BY ORDER TYPE
-- ============================================================================

-- Note: Using DROP IF EXISTS for idempotency
DROP MATERIALIZED VIEW IF EXISTS rider_performance_by_order_type;
CREATE MATERIALIZED VIEW rider_performance_by_order_type AS
SELECT 
  o.rider_id,
  o.order_type,
  COUNT(*) AS total_orders,
  COUNT(*) FILTER (WHERE o.status = 'delivered') AS completed_orders,
  COUNT(*) FILTER (WHERE o.status = 'cancelled') AS cancelled_orders,
  AVG(EXTRACT(EPOCH FROM (o.actual_delivery_time - o.actual_pickup_time))/60) AS avg_delivery_time_minutes,
  SUM(o.rider_earning) AS total_earnings,
  AVG(o.rider_earning) AS avg_earnings_per_order,
  AVG(o.customer_rating) AS avg_customer_rating
FROM orders o
WHERE o.rider_id IS NOT NULL
GROUP BY o.rider_id, o.order_type;

CREATE UNIQUE INDEX IF NOT EXISTS rider_performance_by_order_type_pkey 
  ON rider_performance_by_order_type(rider_id, order_type);

-- ============================================================================
-- ACTIVE ORDERS WITH RIDER
-- ============================================================================

-- Note: PostgreSQL doesn't support IF NOT EXISTS for CREATE VIEW
DROP VIEW IF EXISTS active_orders_with_rider;
CREATE VIEW active_orders_with_rider AS
SELECT 
  o.id AS order_id,
  o.order_type,
  o.status,
  o.rider_id,
  r.name AS rider_name,
  r.mobile AS rider_mobile,
  o.customer_id,
  o.merchant_store_id,
  o.pickup_address,
  o.drop_address,
  o.fare_amount,
  o.rider_earning,
  o.created_at,
  o.estimated_delivery_time,
  ora.assignment_status,
  ora.distance_to_pickup_km
FROM orders o
LEFT JOIN riders r ON o.rider_id = r.id
LEFT JOIN order_rider_assignments ora ON o.id = ora.order_id 
  AND ora.assignment_status IN ('pending', 'assigned', 'accepted')
WHERE o.status NOT IN ('delivered', 'cancelled', 'failed');

-- ============================================================================
-- PROVIDER SYNC STATUS
-- ============================================================================

-- Note: PostgreSQL doesn't support IF NOT EXISTS for CREATE VIEW
DROP VIEW IF EXISTS provider_sync_status;
CREATE VIEW provider_sync_status AS
SELECT 
  o.source AS provider_type,
  COUNT(*) AS total_orders,
  COUNT(*) FILTER (WHERE o.synced_with_provider = TRUE) AS synced_orders,
  COUNT(*) FILTER (WHERE o.synced_with_provider = FALSE) AS unsynced_orders,
  COUNT(*) FILTER (WHERE o.sync_status = 'failed') AS failed_syncs,
  COUNT(*) FILTER (WHERE o.sync_status = 'pending') AS pending_syncs,
  ROUND(
    COUNT(*) FILTER (WHERE o.synced_with_provider = TRUE)::NUMERIC / 
    NULLIF(COUNT(*), 0) * 100, 
    2
  ) AS sync_success_rate
FROM orders o
WHERE o.source != 'internal'
GROUP BY o.source;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON MATERIALIZED VIEW provider_performance_summary IS 'Summary of provider performance metrics by order type';
COMMENT ON MATERIALIZED VIEW order_source_distribution IS 'Daily order distribution by source and type';
COMMENT ON MATERIALIZED VIEW rider_performance_by_order_type IS 'Rider performance metrics grouped by order type';
COMMENT ON VIEW active_orders_with_rider IS 'Real-time view of active orders with rider information';
COMMENT ON VIEW provider_sync_status IS 'Current sync status summary for external providers';

-- ============================================================================
-- REFRESH FUNCTIONS
-- ============================================================================

-- Note: These materialized views should be refreshed periodically
-- Example: REFRESH MATERIALIZED VIEW CONCURRENTLY provider_performance_summary;
-- Consider setting up a scheduled job to refresh these views
