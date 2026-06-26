-- ============================================================================
-- CRITICAL INDEXES - PART 2: Service-Specific & Payments
-- Migration: 0023_critical_indexes_part2
-- Database: Supabase PostgreSQL
-- 
-- This file adds indexes for service-specific tables and payment tables
-- ============================================================================

-- ============================================================================
-- ORDER FOOD DETAILS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_food_details_order_id_idx ON order_food_details(order_id);
CREATE INDEX IF NOT EXISTS order_food_details_restaurant_id_idx ON order_food_details(restaurant_id) WHERE restaurant_id IS NOT NULL;

-- ============================================================================
-- ORDER FOOD ITEMS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_food_items_order_id_idx ON order_food_items(order_id);
CREATE INDEX IF NOT EXISTS order_food_items_item_name_idx ON order_food_items(item_name);

-- ============================================================================
-- ORDER PARCEL DETAILS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_parcel_details_order_id_idx ON order_parcel_details(order_id);
CREATE INDEX IF NOT EXISTS order_parcel_details_is_cod_idx ON order_parcel_details(is_cod) WHERE is_cod = TRUE;
CREATE INDEX IF NOT EXISTS order_parcel_details_cod_collected_idx ON order_parcel_details(cod_collected) WHERE cod_collected = FALSE;

-- ============================================================================
-- ORDER RIDE DETAILS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_ride_details_order_id_idx ON order_ride_details(order_id);
CREATE INDEX IF NOT EXISTS order_ride_details_scheduled_ride_idx ON order_ride_details(scheduled_ride) WHERE scheduled_ride = TRUE;
CREATE INDEX IF NOT EXISTS order_ride_details_scheduled_pickup_time_idx ON order_ride_details(scheduled_pickup_time) WHERE scheduled_pickup_time IS NOT NULL;

-- ============================================================================
-- ORDER ITEMS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_item_type_idx ON order_items(item_type);
CREATE INDEX IF NOT EXISTS order_items_merchant_menu_item_id_idx ON order_items(merchant_menu_item_id) WHERE merchant_menu_item_id IS NOT NULL;

-- ============================================================================
-- ORDER ITEM ADDONS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_item_addons_order_item_id_idx ON order_item_addons(order_item_id);
CREATE INDEX IF NOT EXISTS order_item_addons_addon_id_idx ON order_item_addons(addon_id) WHERE addon_id IS NOT NULL;

-- ============================================================================
-- ORDER PAYMENTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_payments_order_id_idx ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS order_payments_payment_status_idx ON order_payments(payment_status);
CREATE INDEX IF NOT EXISTS order_payments_payment_mode_idx ON order_payments(payment_mode);
CREATE INDEX IF NOT EXISTS order_payments_transaction_id_idx ON order_payments(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_payments_pg_order_id_idx ON order_payments(pg_order_id) WHERE pg_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_payments_pg_payment_id_idx ON order_payments(pg_payment_id) WHERE pg_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_payments_order_status_idx ON order_payments(order_id, payment_status);
CREATE INDEX IF NOT EXISTS order_payments_pending_idx ON order_payments(payment_status, created_at) 
  WHERE payment_status IN ('pending', 'processing');

-- ============================================================================
-- ORDER REFUNDS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_refunds_order_id_idx ON order_refunds(order_id);
CREATE INDEX IF NOT EXISTS order_refunds_order_payment_id_idx ON order_refunds(order_payment_id) WHERE order_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_refunds_refund_status_idx ON order_refunds(refund_status);
CREATE INDEX IF NOT EXISTS order_refunds_refund_type_idx ON order_refunds(refund_type);
CREATE INDEX IF NOT EXISTS order_refunds_refund_id_idx ON order_refunds(refund_id) WHERE refund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_refunds_pg_transaction_id_idx ON order_refunds(pg_transaction_id) WHERE pg_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_refunds_pending_idx ON order_refunds(refund_status, created_at) 
  WHERE refund_status = 'pending';

-- ============================================================================
-- ORDER CANCELLATION REASONS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_cancellation_reasons_order_id_idx ON order_cancellation_reasons(order_id);
CREATE INDEX IF NOT EXISTS order_cancellation_reasons_cancelled_by_idx ON order_cancellation_reasons(cancelled_by);
CREATE INDEX IF NOT EXISTS order_cancellation_reasons_reason_code_idx ON order_cancellation_reasons(reason_code);
CREATE INDEX IF NOT EXISTS order_cancellation_reasons_refund_status_idx ON order_cancellation_reasons(refund_status);

-- ============================================================================
-- ORDER RATINGS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_ratings_order_id_idx ON order_ratings(order_id);
CREATE INDEX IF NOT EXISTS order_ratings_rider_id_idx ON order_ratings(rider_id);
CREATE INDEX IF NOT EXISTS order_ratings_rated_by_idx ON order_ratings(rated_by);
CREATE INDEX IF NOT EXISTS order_ratings_rating_idx ON order_ratings(rating);

-- ============================================================================
-- ORDER REMARKS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_remarks_order_id_idx ON order_remarks(order_id);
CREATE INDEX IF NOT EXISTS order_remarks_actor_type_idx ON order_remarks(actor_type);
CREATE INDEX IF NOT EXISTS order_remarks_created_at_idx ON order_remarks(created_at);
CREATE INDEX IF NOT EXISTS order_remarks_order_created_idx ON order_remarks(order_id, created_at DESC);

-- ============================================================================
-- ORDER INSTRUCTIONS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_instructions_order_id_idx ON order_instructions(order_id);
CREATE INDEX IF NOT EXISTS order_instructions_instruction_for_idx ON order_instructions(instruction_for);
CREATE INDEX IF NOT EXISTS order_instructions_priority_idx ON order_instructions(instruction_priority);

-- ============================================================================
-- ORDER NOTIFICATIONS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_notifications_order_id_idx ON order_notifications(order_id);
CREATE INDEX IF NOT EXISTS order_notifications_notification_type_idx ON order_notifications(notification_type);
CREATE INDEX IF NOT EXISTS order_notifications_sent_at_idx ON order_notifications(sent_at);
CREATE INDEX IF NOT EXISTS order_notifications_recipient_idx ON order_notifications(recipient_type, recipient_id);

-- ============================================================================
-- ORDER DISPUTES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_disputes_order_id_idx ON order_disputes(order_id);
CREATE INDEX IF NOT EXISTS order_disputes_order_ticket_id_idx ON order_disputes(order_ticket_id) WHERE order_ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_disputes_dispute_status_idx ON order_disputes(dispute_status);
CREATE INDEX IF NOT EXISTS order_disputes_dispute_type_idx ON order_disputes(dispute_type);
-- Note: order_disputes table has 'raised_by' (TEXT), not 'raised_by_type'
CREATE INDEX IF NOT EXISTS order_disputes_raised_by_idx ON order_disputes(raised_by, raised_by_id);

-- ============================================================================
-- ORDER TICKETS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_tickets_order_id_idx ON order_tickets(order_id);
CREATE INDEX IF NOT EXISTS order_tickets_ticket_source_idx ON order_tickets(ticket_source);
CREATE INDEX IF NOT EXISTS order_tickets_status_idx ON order_tickets(status);
CREATE INDEX IF NOT EXISTS order_tickets_priority_idx ON order_tickets(priority);
CREATE INDEX IF NOT EXISTS order_tickets_assigned_to_agent_id_idx ON order_tickets(assigned_to_agent_id) WHERE assigned_to_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_tickets_open_idx ON order_tickets(status, created_at) 
  WHERE status = 'open';

-- ============================================================================
-- ORDER CONFLICTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_conflicts_order_id_idx ON order_conflicts(order_id);
CREATE INDEX IF NOT EXISTS order_conflicts_provider_type_idx ON order_conflicts(provider_type);
CREATE INDEX IF NOT EXISTS order_conflicts_conflict_type_idx ON order_conflicts(conflict_type);
CREATE INDEX IF NOT EXISTS order_conflicts_unresolved_idx ON order_conflicts(order_id, provider_type, created_at DESC)
  WHERE resolved = FALSE;

-- ============================================================================
-- ORDER SYNC LOGS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_sync_logs_order_id_idx ON order_sync_logs(order_id);
CREATE INDEX IF NOT EXISTS order_sync_logs_provider_type_idx ON order_sync_logs(provider_type);
CREATE INDEX IF NOT EXISTS order_sync_logs_sync_direction_idx ON order_sync_logs(sync_direction);
CREATE INDEX IF NOT EXISTS order_sync_logs_success_idx ON order_sync_logs(success);
CREATE INDEX IF NOT EXISTS order_sync_logs_failed_idx ON order_sync_logs(order_id, provider_type, created_at DESC)
  WHERE success = FALSE;

-- ============================================================================
-- ORDERS TABLE - SERVICE-SPECIFIC INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS orders_restaurant_name_idx ON orders(restaurant_name) WHERE restaurant_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_is_cod_idx ON orders(is_cod) WHERE is_cod = TRUE;
CREATE INDEX IF NOT EXISTS orders_cod_amount_idx ON orders(cod_amount) WHERE cod_amount IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_ride_type_idx ON orders(ride_type) WHERE ride_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_vehicle_type_required_idx ON orders(vehicle_type_required) WHERE vehicle_type_required IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_scheduled_ride_idx ON orders(scheduled_ride) WHERE scheduled_ride = TRUE;
CREATE INDEX IF NOT EXISTS orders_scheduled_pickup_time_idx ON orders(scheduled_pickup_time) WHERE scheduled_pickup_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_priority_idx ON orders(priority);
CREATE INDEX IF NOT EXISTS orders_estimated_pickup_time_idx ON orders(estimated_pickup_time) WHERE estimated_pickup_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_estimated_delivery_time_idx ON orders(estimated_delivery_time) WHERE estimated_delivery_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_order_type_priority_idx ON orders(order_type, priority);
CREATE INDEX IF NOT EXISTS orders_source_idx ON orders(source);
CREATE INDEX IF NOT EXISTS orders_current_status_idx ON orders(current_status) WHERE current_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON orders(payment_status);
CREATE INDEX IF NOT EXISTS orders_payment_method_idx ON orders(payment_method) WHERE payment_method IS NOT NULL;

-- ============================================================================
-- ORDERS TABLE - PROVIDER SYNC INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS orders_sync_pending_idx ON orders(source, synced_with_provider, sync_status)
  WHERE source != 'internal' AND (synced_with_provider = FALSE OR sync_status = 'failed');
CREATE INDEX IF NOT EXISTS orders_provider_order_id_idx ON orders(provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_external_order_id_idx ON orders(external_order_id) WHERE external_order_id IS NOT NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX order_payments_pending_idx IS 'Optimizes queries for pending payment processing';
COMMENT ON INDEX order_refunds_pending_idx IS 'Optimizes queries for pending refund processing';
COMMENT ON INDEX order_conflicts_unresolved_idx IS 'Optimizes queries for unresolved order conflicts';
