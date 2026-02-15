-- ============================================================================
-- CRITICAL INDEXES - PART 1: Core Tables
-- Migration: 0022_critical_indexes_part1
-- Database: Supabase PostgreSQL
-- 
-- This file adds all missing critical indexes for core tables
-- Run this AFTER all migrations (0002-0021) have been executed
-- ============================================================================

-- ============================================================================
-- RIDERS TABLE INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS riders_mobile_idx ON riders(mobile);
CREATE UNIQUE INDEX IF NOT EXISTS riders_referral_code_idx ON riders(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS riders_status_idx ON riders(status);
CREATE INDEX IF NOT EXISTS riders_city_idx ON riders(city);
CREATE INDEX IF NOT EXISTS riders_kyc_status_idx ON riders(kyc_status);
CREATE INDEX IF NOT EXISTS riders_onboarding_stage_idx ON riders(onboarding_stage);
CREATE INDEX IF NOT EXISTS riders_created_at_idx ON riders(created_at);
CREATE INDEX IF NOT EXISTS riders_active_city_idx ON riders(city, status) WHERE status = 'ACTIVE';

-- ============================================================================
-- RIDER DOCUMENTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS rider_documents_rider_id_idx ON rider_documents(rider_id);
CREATE INDEX IF NOT EXISTS rider_documents_doc_type_idx ON rider_documents(doc_type);
CREATE INDEX IF NOT EXISTS rider_documents_verified_idx ON rider_documents(verified);
CREATE INDEX IF NOT EXISTS rider_documents_rider_doc_type_idx ON rider_documents(rider_id, doc_type);

-- ============================================================================
-- RIDER DEVICES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS rider_devices_rider_id_idx ON rider_devices(rider_id);
CREATE INDEX IF NOT EXISTS rider_devices_device_id_idx ON rider_devices(device_id);
CREATE INDEX IF NOT EXISTS rider_devices_allowed_idx ON rider_devices(allowed);
CREATE INDEX IF NOT EXISTS rider_devices_rider_active_idx ON rider_devices(rider_id, allowed) WHERE allowed = TRUE;

-- ============================================================================
-- BLACKLIST HISTORY INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS blacklist_history_rider_id_idx ON blacklist_history(rider_id);
CREATE INDEX IF NOT EXISTS blacklist_history_banned_idx ON blacklist_history(banned);
CREATE INDEX IF NOT EXISTS blacklist_history_created_at_idx ON blacklist_history(created_at);

-- ============================================================================
-- DUTY LOGS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS duty_logs_rider_id_idx ON duty_logs(rider_id);
CREATE INDEX IF NOT EXISTS duty_logs_timestamp_idx ON duty_logs(timestamp);
CREATE INDEX IF NOT EXISTS duty_logs_rider_status_idx ON duty_logs(rider_id, status);
CREATE INDEX IF NOT EXISTS duty_logs_rider_created_desc_idx ON duty_logs(rider_id, timestamp DESC);

-- ============================================================================
-- LOCATION LOGS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS location_logs_rider_id_idx ON location_logs(rider_id);
CREATE INDEX IF NOT EXISTS location_logs_created_at_idx ON location_logs(created_at);
CREATE INDEX IF NOT EXISTS location_logs_rider_created_idx ON location_logs(rider_id, created_at);
-- Note: Cannot use NOW() in index predicate (not IMMUTABLE)
-- Application should filter by time when querying recent location logs
CREATE INDEX IF NOT EXISTS location_logs_rider_created_desc_idx ON location_logs(rider_id, created_at DESC);

-- ============================================================================
-- ORDERS TABLE - CORE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS orders_rider_id_idx ON orders(rider_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS orders_order_type_idx ON orders(order_type);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at);
CREATE INDEX IF NOT EXISTS orders_rider_status_idx ON orders(rider_id, status);
CREATE INDEX IF NOT EXISTS orders_external_ref_idx ON orders(external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_merchant_store_id_idx ON orders(merchant_store_id) WHERE merchant_store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_order_uuid_idx ON orders(order_uuid) WHERE order_uuid IS NOT NULL;

-- ============================================================================
-- ORDERS TABLE - COMPOSITE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS orders_rider_status_created_idx ON orders(rider_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_type_status_created_idx ON orders(order_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_source_status_created_idx ON orders(source, status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_customer_status_created_idx ON orders(customer_id, status, created_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_merchant_status_created_idx ON orders(merchant_store_id, status, created_at DESC) WHERE merchant_store_id IS NOT NULL;

-- ============================================================================
-- ORDERS TABLE - PARTIAL INDEXES (ACTIVE ORDERS)
-- ============================================================================

CREATE INDEX IF NOT EXISTS orders_rider_active_status_idx ON orders(rider_id, status) 
  WHERE status IN ('assigned', 'accepted', 'reached_store', 'picked_up', 'in_transit');
CREATE INDEX IF NOT EXISTS orders_active_rider_idx ON orders(rider_id, order_type, created_at DESC)
  WHERE status NOT IN ('delivered', 'cancelled', 'failed');
-- Note: order_status_type enum doesn't have 'pending', only: assigned, accepted, reached_store, picked_up, in_transit, delivered, cancelled, failed
CREATE INDEX IF NOT EXISTS orders_pending_orders_idx ON orders(status, created_at) 
  WHERE status IN ('assigned');

-- ============================================================================
-- ORDER ACTIONS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_actions_order_id_idx ON order_actions(order_id);
CREATE INDEX IF NOT EXISTS order_actions_rider_id_idx ON order_actions(rider_id);
CREATE INDEX IF NOT EXISTS order_actions_timestamp_idx ON order_actions(timestamp);
CREATE INDEX IF NOT EXISTS order_actions_order_rider_idx ON order_actions(order_id, rider_id, timestamp DESC);

-- ============================================================================
-- ORDER EVENTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_events_order_id_idx ON order_events(order_id);
CREATE INDEX IF NOT EXISTS order_events_created_at_idx ON order_events(created_at);
CREATE INDEX IF NOT EXISTS order_events_order_created_asc_idx ON order_events(order_id, created_at ASC);
CREATE INDEX IF NOT EXISTS order_events_order_created_desc_idx ON order_events(order_id, created_at DESC);

-- ============================================================================
-- ORDER ASSIGNMENTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_assignments_order_id_idx ON order_assignments(order_id);
CREATE INDEX IF NOT EXISTS order_assignments_rider_id_idx ON order_assignments(rider_id);
CREATE INDEX IF NOT EXISTS order_assignments_status_idx ON order_assignments(status);
CREATE INDEX IF NOT EXISTS order_assignments_pending_idx ON order_assignments(order_id, status, created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS order_assignments_rider_pending_idx ON order_assignments(rider_id, status, created_at DESC)
  WHERE status = 'pending';

-- ============================================================================
-- ORDER RIDER ASSIGNMENTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_rider_assignments_order_id_idx ON order_rider_assignments(order_id);
CREATE INDEX IF NOT EXISTS order_rider_assignments_rider_id_idx ON order_rider_assignments(rider_id);
CREATE INDEX IF NOT EXISTS order_rider_assignments_assignment_status_idx ON order_rider_assignments(assignment_status);
CREATE INDEX IF NOT EXISTS order_rider_assignments_active_assignment_idx ON order_rider_assignments(order_id, assignment_status)
  WHERE assignment_status IN ('pending', 'assigned', 'accepted');
CREATE INDEX IF NOT EXISTS order_rider_assignments_created_at_idx ON order_rider_assignments(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS order_rider_assignments_active_unique_idx 
  ON order_rider_assignments(order_id, rider_id, assignment_status) 
  WHERE assignment_status IN ('pending', 'assigned', 'accepted');

-- ============================================================================
-- ORDER STATUS HISTORY INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_status_history_order_id_idx ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS order_status_history_created_at_idx ON order_status_history(created_at);
CREATE INDEX IF NOT EXISTS order_status_history_order_created_idx ON order_status_history(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_status_history_to_status_idx ON order_status_history(to_status);

-- ============================================================================
-- ORDER TIMELINE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_timeline_order_id_idx ON order_timeline(order_id);
CREATE INDEX IF NOT EXISTS order_timeline_status_idx ON order_timeline(status);
CREATE INDEX IF NOT EXISTS order_timeline_occurred_at_idx ON order_timeline(occurred_at);
CREATE INDEX IF NOT EXISTS order_timeline_order_occurred_idx ON order_timeline(order_id, occurred_at DESC);

-- ============================================================================
-- ORDER AUDIT LOG INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_audit_log_order_id_idx ON order_audit_log(order_id);
CREATE INDEX IF NOT EXISTS order_audit_log_action_type_idx ON order_audit_log(action_type);
CREATE INDEX IF NOT EXISTS order_audit_log_created_at_idx ON order_audit_log(created_at);
CREATE INDEX IF NOT EXISTS order_audit_log_order_created_idx ON order_audit_log(order_id, created_at DESC);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX orders_rider_status_created_idx IS 'Optimizes queries for rider orders by status and creation time';
COMMENT ON INDEX orders_active_rider_idx IS 'Optimizes queries for active orders (not completed/cancelled)';
COMMENT ON INDEX order_rider_assignments_active_unique_idx IS 'Ensures only one active assignment per order';
