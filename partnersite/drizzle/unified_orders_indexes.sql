-- ============================================================================
-- UNIFIED ORDERS INDEXES FOR PERFORMANCE OPTIMIZATION
-- Production-Grade Indexes for Millions of Orders
-- Additional indexes beyond those in table creation files
-- Migration: unified_orders_indexes
-- Database: PostgreSQL
-- ORM: Drizzle
-- 
-- DESIGN PRINCIPLES:
-- - Query Performance: Indexes optimized for common query patterns
-- - Composite Indexes: Multi-column indexes for complex queries
-- - Partial Indexes: Indexes on filtered subsets for better performance
-- - Covering Indexes: Include frequently accessed columns
-- ============================================================================

-- ============================================================================
-- ORDERS TABLE - ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

-- Composite index for customer order history queries
CREATE INDEX IF NOT EXISTS orders_customer_type_status_created_idx 
  ON public.orders(customer_id, order_type, status, created_at DESC) 
  WHERE customer_id IS NOT NULL;

-- Composite index for merchant order queries
CREATE INDEX IF NOT EXISTS orders_merchant_type_status_created_idx 
  ON public.orders(merchant_store_id, order_type, status, created_at DESC) 
  WHERE merchant_store_id IS NOT NULL;

-- Composite index for rider order queries
CREATE INDEX IF NOT EXISTS orders_rider_type_status_created_idx 
  ON public.orders(current_rider_id, order_type, status, created_at DESC) 
  WHERE current_rider_id IS NOT NULL;

-- Index for pending orders (common query)
CREATE INDEX IF NOT EXISTS orders_pending_orders_idx 
  ON public.orders(status, created_at DESC) 
  WHERE status IN ('assigned', 'accepted', 'reached_store', 'picked_up', 'in_transit');

-- Index for cancelled orders
CREATE INDEX IF NOT EXISTS orders_cancelled_orders_idx 
  ON public.orders(cancelled_at DESC) 
  WHERE cancelled_at IS NOT NULL;

-- Index for orders needing sync
CREATE INDEX IF NOT EXISTS orders_sync_pending_idx 
  ON public.orders(order_source, sync_status, created_at DESC) 
  WHERE sync_status IN ('pending', 'failed') AND order_source != 'internal';

-- Index for TPL orders
CREATE INDEX IF NOT EXISTS orders_tpl_orders_idx 
  ON public.orders(tpl_provider_id, status, created_at DESC) 
  WHERE tpl_provider_id IS NOT NULL;

-- Index for bulk orders
CREATE INDEX IF NOT EXISTS orders_bulk_order_group_idx 
  ON public.orders(bulk_order_group_id, created_at DESC) 
  WHERE bulk_order_group_id IS NOT NULL;

-- Index for orders by payment status
CREATE INDEX IF NOT EXISTS orders_payment_status_created_idx 
  ON public.orders(payment_status, created_at DESC) 
  WHERE payment_status IS NOT NULL;

-- Index for orders with refunds
CREATE INDEX IF NOT EXISTS orders_refunded_orders_idx 
  ON public.orders(refund_status, refund_amount, created_at DESC) 
  WHERE refund_status IS NOT NULL AND refund_amount > 0;

-- ============================================================================
-- ORDER ITEMS TABLE - ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

-- Composite index for item queries by order and type
CREATE INDEX IF NOT EXISTS order_items_order_type_category_idx 
  ON public.order_items(order_id, item_type, item_category) 
  WHERE item_type IS NOT NULL;

-- Index for food items
CREATE INDEX IF NOT EXISTS order_items_food_items_idx 
  ON public.order_items(order_id, is_veg) 
  WHERE item_type = 'food_item';

-- Index for high-value items
CREATE INDEX IF NOT EXISTS order_items_high_value_idx 
  ON public.order_items(order_id, final_item_price DESC) 
  WHERE final_item_price > 1000;

-- ============================================================================
-- ORDER RIDER ASSIGNMENTS TABLE - ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

-- Composite index for rider performance queries
CREATE INDEX IF NOT EXISTS order_rider_assignments_rider_status_created_idx 
  ON public.order_rider_assignments(rider_id, assignment_status, created_at DESC) 
  WHERE rider_id IS NOT NULL;

-- Index for completed assignments
CREATE INDEX IF NOT EXISTS order_rider_assignments_completed_idx 
  ON public.order_rider_assignments(rider_id, delivered_at DESC) 
  WHERE assignment_status = 'completed' AND delivered_at IS NOT NULL;

-- Index for rejected assignments
CREATE INDEX IF NOT EXISTS order_rider_assignments_rejected_idx 
  ON public.order_rider_assignments(rider_id, rejected_at DESC) 
  WHERE assignment_status = 'rejected' AND rejected_at IS NOT NULL;

-- Index for provider assignments
CREATE INDEX IF NOT EXISTS order_rider_assignments_provider_idx 
  ON public.order_rider_assignments(delivery_provider, assignment_status, created_at DESC) 
  WHERE delivery_provider IS NOT NULL AND delivery_provider != 'internal';

-- ============================================================================
-- ORDER TIMELINE TABLE - ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

-- Composite index for timeline queries by order and status
CREATE INDEX IF NOT EXISTS order_timeline_order_status_occurred_idx 
  ON public.order_timeline(order_id, status, occurred_at DESC);

-- Index for timeline by actor
CREATE INDEX IF NOT EXISTS order_timeline_actor_occurred_idx 
  ON public.order_timeline(actor_type, actor_id, occurred_at DESC) 
  WHERE actor_id IS NOT NULL;

-- Index for unsynced timeline entries
CREATE INDEX IF NOT EXISTS order_timeline_unsynced_idx 
  ON public.order_timeline(order_id, occurred_at DESC) 
  WHERE synced_to_provider = FALSE;

-- ============================================================================
-- ORDER PAYMENTS TABLE - ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

-- Composite index for payment queries by order and status
CREATE INDEX IF NOT EXISTS order_payments_order_status_created_idx 
  ON public.order_payments(order_id, payment_status, created_at DESC);

-- Index for failed payments
CREATE INDEX IF NOT EXISTS order_payments_failed_idx 
  ON public.order_payments(order_id, created_at DESC) 
  WHERE payment_status = 'failed';

-- Index for refunded payments
CREATE INDEX IF NOT EXISTS order_payments_refunded_idx 
  ON public.order_payments(order_id, created_at DESC) 
  WHERE is_refunded = TRUE;

-- Index for payment gateway queries
CREATE INDEX IF NOT EXISTS order_payments_gateway_idx 
  ON public.order_payments(pg_name, payment_status, created_at DESC) 
  WHERE pg_name IS NOT NULL;

-- ============================================================================
-- ORDER REFUNDS TABLE - ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

-- Composite index for refund queries by order and status
CREATE INDEX IF NOT EXISTS order_refunds_order_status_created_idx 
  ON public.order_refunds(order_id, refund_status, created_at DESC);

-- Index for pending refunds
CREATE INDEX IF NOT EXISTS order_refunds_pending_idx 
  ON public.order_refunds(refund_status, created_at DESC) 
  WHERE refund_status = 'pending';

-- Index for refunds by type
CREATE INDEX IF NOT EXISTS order_refunds_type_created_idx 
  ON public.order_refunds(refund_type, created_at DESC);

-- ============================================================================
-- ORDER TICKETS TABLE - ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

-- Composite index for ticket queries by order and status
CREATE INDEX IF NOT EXISTS order_tickets_order_status_priority_idx 
  ON public.order_tickets(order_id, status, priority, created_at DESC);

-- Index for open tickets
CREATE INDEX IF NOT EXISTS order_tickets_open_idx 
  ON public.order_tickets(status, priority, created_at DESC) 
  WHERE status IN ('open', 'in_progress');

-- Index for tickets by agent
CREATE INDEX IF NOT EXISTS order_tickets_agent_idx 
  ON public.order_tickets(assigned_to_agent_id, status, created_at DESC) 
  WHERE assigned_to_agent_id IS NOT NULL;

-- Index for high priority tickets
CREATE INDEX IF NOT EXISTS order_tickets_high_priority_idx 
  ON public.order_tickets(order_id, created_at DESC) 
  WHERE priority IN ('urgent', 'critical');

-- ============================================================================
-- ORDER NOTIFICATIONS TABLE - ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

-- Composite index for notification queries
CREATE INDEX IF NOT EXISTS order_notifications_order_type_channel_idx 
  ON public.order_notifications(order_id, notification_type, notification_channel, sent_at DESC);

-- Index for failed notifications
CREATE INDEX IF NOT EXISTS order_notifications_failed_idx 
  ON public.order_notifications(order_id, sent_at DESC) 
  WHERE failed_at IS NOT NULL;

-- Index for unread notifications
CREATE INDEX IF NOT EXISTS order_notifications_unread_idx 
  ON public.order_notifications(recipient_id, sent_at DESC) 
  WHERE read_at IS NULL AND recipient_id IS NOT NULL;

-- ============================================================================
-- ORDER AUDIT LOG TABLE - ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

-- Composite index for audit log queries by order and action
CREATE INDEX IF NOT EXISTS order_audit_log_order_action_created_idx 
  ON public.order_audit_log(order_id, action_type, created_at DESC);

-- Index for audit log by actor
CREATE INDEX IF NOT EXISTS order_audit_log_actor_created_idx 
  ON public.order_audit_log(actor_type, actor_id, created_at DESC) 
  WHERE actor_id IS NOT NULL;

-- ============================================================================
-- PROVIDER TABLES - ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

-- Composite index for provider mapping queries
CREATE INDEX IF NOT EXISTS order_provider_mapping_provider_status_idx 
  ON public.order_provider_mapping(provider_id, sync_status, created_at DESC);

-- Index for provider conflicts
CREATE INDEX IF NOT EXISTS order_conflicts_provider_unresolved_idx 
  ON public.order_conflicts(provider_type, created_at DESC) 
  WHERE resolved = FALSE;

-- Index for sync logs by provider
CREATE INDEX IF NOT EXISTS order_sync_logs_provider_success_idx 
  ON public.order_sync_logs(provider_type, success, created_at DESC);

-- ============================================================================
-- SERVICE-SPECIFIC TABLES - ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

-- Index for food orders by restaurant
CREATE INDEX IF NOT EXISTS order_food_details_restaurant_created_idx 
  ON public.order_food_details(restaurant_id, created_at DESC) 
  WHERE restaurant_id IS NOT NULL;

-- Index for COD parcels
CREATE INDEX IF NOT EXISTS order_parcel_details_cod_uncollected_idx 
  ON public.order_parcel_details(order_id, cod_collected) 
  WHERE is_cod = TRUE AND cod_collected = FALSE;

-- Index for scheduled rides
CREATE INDEX IF NOT EXISTS order_ride_details_scheduled_idx 
  ON public.order_ride_details(scheduled_pickup_time) 
  WHERE scheduled_ride = TRUE AND scheduled_pickup_time IS NOT NULL;

-- ============================================================================
-- TRACKING TABLES - ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

-- Index for recent route snapshots
-- Note: Cannot use NOW() in index predicate (not IMMUTABLE)
-- Instead, index on recorded_at DESC and let queries filter by date range
CREATE INDEX IF NOT EXISTS order_route_snapshots_recent_idx 
  ON public.order_route_snapshots(order_id, recorded_at DESC) 
  WHERE recorded_at IS NOT NULL;

-- Index for parcel tracking events by type
CREATE INDEX IF NOT EXISTS parcel_tracking_events_type_created_idx 
  ON public.parcel_tracking_events(order_id, event_type, created_at DESC);

-- Index for COD collections by rider
CREATE INDEX IF NOT EXISTS cod_collections_rider_created_idx 
  ON public.cod_collections(collected_by, collected_at DESC);

-- Index for undeposited COD
CREATE INDEX IF NOT EXISTS cod_collections_undeposited_idx 
  ON public.cod_collections(collected_at DESC) 
  WHERE deposited_to_bank = FALSE;

-- ============================================================================
-- PARTITIONING CONSIDERATIONS (For Future Implementation)
-- ============================================================================

-- Note: For tables with millions of rows, consider partitioning:
-- 
-- 1. order_timeline: Partition by created_at (monthly partitions)
--    CREATE TABLE order_timeline_2024_01 PARTITION OF order_timeline
--    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
--
-- 2. order_audit_log: Partition by created_at (monthly partitions)
--    CREATE TABLE order_audit_log_2024_01 PARTITION OF order_audit_log
--    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
--
-- 3. order_payments: Partition by created_at (monthly partitions)
--    CREATE TABLE order_payments_2024_01 PARTITION OF order_payments
--    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
--
-- 4. order_notifications: Partition by sent_at (monthly partitions)
--    CREATE TABLE order_notifications_2024_01 PARTITION OF order_notifications
--    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX orders_customer_type_status_created_idx IS 'Optimized for customer order history queries filtered by type and status.';
COMMENT ON INDEX orders_merchant_type_status_created_idx IS 'Optimized for merchant order queries filtered by type and status.';
COMMENT ON INDEX orders_rider_type_status_created_idx IS 'Optimized for rider order queries filtered by type and status.';
COMMENT ON INDEX orders_pending_orders_idx IS 'Optimized for queries of pending/active orders.';
COMMENT ON INDEX orders_sync_pending_idx IS 'Optimized for queries of orders needing sync with external providers.';
COMMENT ON INDEX order_rider_assignments_rider_status_created_idx IS 'Optimized for rider performance queries.';
COMMENT ON INDEX order_timeline_order_status_occurred_idx IS 'Optimized for timeline queries filtered by status.';
COMMENT ON INDEX order_payments_order_status_created_idx IS 'Optimized for payment queries filtered by status.';
COMMENT ON INDEX order_tickets_order_status_priority_idx IS 'Optimized for ticket queries filtered by status and priority.';
