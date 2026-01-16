-- ============================================================================
-- CRITICAL INDEXES - PART 3: Customer Domain
-- Migration: 0024_critical_indexes_part3
-- Database: Supabase PostgreSQL
-- 
-- This file adds indexes for customer-related tables
-- ============================================================================

-- ============================================================================
-- CUSTOMERS TABLE INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_id_idx ON customers(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS customers_primary_mobile_idx ON customers(primary_mobile);
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_idx ON customers(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_referral_code_idx ON customers(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_account_status_idx ON customers(account_status);
CREATE INDEX IF NOT EXISTS customers_risk_flag_idx ON customers(risk_flag);
CREATE INDEX IF NOT EXISTS customers_created_at_idx ON customers(created_at);
CREATE INDEX IF NOT EXISTS customers_last_order_at_idx ON customers(last_order_at) WHERE last_order_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_active_idx ON customers(account_status, created_at) WHERE account_status = 'ACTIVE';

-- ============================================================================
-- CUSTOMER ADDRESSES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS customer_addresses_customer_id_idx ON customer_addresses(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_address_id_idx ON customer_addresses(address_id);
CREATE INDEX IF NOT EXISTS customer_addresses_is_default_idx ON customer_addresses(is_default) WHERE is_default = TRUE;
CREATE INDEX IF NOT EXISTS customer_addresses_is_active_idx ON customer_addresses(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS customer_addresses_city_idx ON customer_addresses(city);
CREATE INDEX IF NOT EXISTS customer_addresses_postal_code_idx ON customer_addresses(postal_code);

-- ============================================================================
-- CUSTOMER AUTH INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS customer_auth_customer_id_idx ON customer_auth(customer_id);
CREATE INDEX IF NOT EXISTS customer_auth_auth_provider_idx ON customer_auth(auth_provider);
CREATE INDEX IF NOT EXISTS customer_auth_auth_uid_idx ON customer_auth(auth_uid) WHERE auth_uid IS NOT NULL;

-- ============================================================================
-- CUSTOMER DEVICES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS customer_devices_customer_id_idx ON customer_devices(customer_id);
CREATE INDEX IF NOT EXISTS customer_devices_device_id_idx ON customer_devices(device_id);
CREATE INDEX IF NOT EXISTS customer_devices_is_active_idx ON customer_devices(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS customer_devices_is_primary_idx ON customer_devices(is_primary) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS customer_devices_fcm_token_idx ON customer_devices(fcm_token) WHERE fcm_token IS NOT NULL;

-- ============================================================================
-- CUSTOMER SESSIONS INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS customer_sessions_session_token_idx ON customer_sessions(session_token);
CREATE INDEX IF NOT EXISTS customer_sessions_customer_id_idx ON customer_sessions(customer_id);
CREATE INDEX IF NOT EXISTS customer_sessions_device_id_idx ON customer_sessions(device_id) WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customer_sessions_is_active_idx ON customer_sessions(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS customer_sessions_expires_at_idx ON customer_sessions(expires_at);

-- ============================================================================
-- CUSTOMER WALLET INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS customer_wallet_customer_id_idx ON customer_wallet(customer_id);
CREATE INDEX IF NOT EXISTS customer_wallet_is_active_idx ON customer_wallet(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- CUSTOMER WALLET TRANSACTIONS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS customer_wallet_transactions_customer_id_idx ON customer_wallet_transactions(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS customer_wallet_transactions_transaction_id_idx ON customer_wallet_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS customer_wallet_transactions_transaction_type_idx ON customer_wallet_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS customer_wallet_transactions_status_idx ON customer_wallet_transactions(status);
CREATE INDEX IF NOT EXISTS customer_wallet_transactions_created_at_idx ON customer_wallet_transactions(created_at);
CREATE INDEX IF NOT EXISTS customer_wallet_transactions_customer_created_idx ON customer_wallet_transactions(customer_id, created_at DESC);

-- ============================================================================
-- CUSTOMER PAYMENT METHODS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS customer_payment_methods_customer_id_idx ON customer_payment_methods(customer_id);
CREATE INDEX IF NOT EXISTS customer_payment_methods_payment_type_idx ON customer_payment_methods(payment_type);
CREATE INDEX IF NOT EXISTS customer_payment_methods_is_default_idx ON customer_payment_methods(is_default) WHERE is_default = TRUE;
CREATE INDEX IF NOT EXISTS customer_payment_methods_is_active_idx ON customer_payment_methods(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- CUSTOMER PAYMENT HISTORY INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS customer_payment_history_customer_id_idx ON customer_payment_history(customer_id);
CREATE INDEX IF NOT EXISTS customer_payment_history_order_id_idx ON customer_payment_history(order_id) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customer_payment_history_payment_id_idx ON customer_payment_history(payment_id);
CREATE INDEX IF NOT EXISTS customer_payment_history_payment_status_idx ON customer_payment_history(payment_status);
CREATE INDEX IF NOT EXISTS customer_payment_history_payment_method_idx ON customer_payment_history(payment_method);
CREATE INDEX IF NOT EXISTS customer_payment_history_created_at_idx ON customer_payment_history(created_at);

-- ============================================================================
-- CUSTOMER COUPONS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS customer_coupons_customer_id_idx ON customer_coupons(customer_id);
CREATE INDEX IF NOT EXISTS customer_coupons_coupon_code_idx ON customer_coupons(coupon_code);
CREATE INDEX IF NOT EXISTS customer_coupons_status_idx ON customer_coupons(status);
CREATE INDEX IF NOT EXISTS customer_coupons_valid_from_idx ON customer_coupons(valid_from);
CREATE INDEX IF NOT EXISTS customer_coupons_valid_till_idx ON customer_coupons(valid_till);
-- Note: Cannot use NOW() in index predicate (not IMMUTABLE)
-- Index on status and valid_till - application should filter by current date
CREATE INDEX IF NOT EXISTS customer_coupons_active_idx ON customer_coupons(customer_id, status, valid_till) 
  WHERE status = 'ACTIVE';

-- ============================================================================
-- CUSTOMER COUPON USAGE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS customer_coupon_usage_customer_id_idx ON customer_coupon_usage(customer_id);
CREATE INDEX IF NOT EXISTS customer_coupon_usage_order_id_idx ON customer_coupon_usage(order_id);
CREATE INDEX IF NOT EXISTS customer_coupon_usage_customer_coupon_id_idx ON customer_coupon_usage(customer_coupon_id) WHERE customer_coupon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customer_coupon_usage_coupon_code_idx ON customer_coupon_usage(coupon_code);

-- ============================================================================
-- CUSTOMER ORDERS SUMMARY INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS customer_orders_summary_customer_id_idx ON customer_orders_summary(customer_id);
CREATE INDEX IF NOT EXISTS customer_orders_summary_order_id_idx ON customer_orders_summary(order_id);
CREATE INDEX IF NOT EXISTS customer_orders_summary_service_type_idx ON customer_orders_summary(service_type);
CREATE INDEX IF NOT EXISTS customer_orders_summary_order_status_idx ON customer_orders_summary(order_status);
CREATE INDEX IF NOT EXISTS customer_orders_summary_customer_service_idx ON customer_orders_summary(customer_id, service_type);

-- ============================================================================
-- CUSTOMER RATINGS GIVEN INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS customer_ratings_given_customer_id_idx ON customer_ratings_given(customer_id);
CREATE INDEX IF NOT EXISTS customer_ratings_given_order_id_idx ON customer_ratings_given(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customer_ratings_given_target_idx ON customer_ratings_given(target_type, target_id);
CREATE INDEX IF NOT EXISTS customer_ratings_given_overall_rating_idx ON customer_ratings_given(overall_rating);
CREATE INDEX IF NOT EXISTS customer_ratings_given_created_at_idx ON customer_ratings_given(created_at);

-- ============================================================================
-- CUSTOMER RATINGS RECEIVED INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS customer_ratings_received_customer_id_idx ON customer_ratings_received(customer_id);
CREATE INDEX IF NOT EXISTS customer_ratings_received_order_id_idx ON customer_ratings_received(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customer_ratings_received_rider_id_idx ON customer_ratings_received(rider_id) WHERE rider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customer_ratings_received_rating_idx ON customer_ratings_received(rating);

-- ============================================================================
-- CUSTOMER TIPS GIVEN INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS customer_tips_given_customer_id_idx ON customer_tips_given(customer_id);
CREATE INDEX IF NOT EXISTS customer_tips_given_order_id_idx ON customer_tips_given(order_id);
CREATE INDEX IF NOT EXISTS customer_tips_given_rider_id_idx ON customer_tips_given(rider_id);
CREATE INDEX IF NOT EXISTS customer_tips_given_tip_paid_idx ON customer_tips_given(tip_paid) WHERE tip_paid = FALSE;

-- ============================================================================
-- CUSTOMER LOYALTY INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS customer_loyalty_customer_id_idx ON customer_loyalty(customer_id);
CREATE INDEX IF NOT EXISTS customer_loyalty_loyalty_tier_idx ON customer_loyalty(loyalty_tier);
CREATE INDEX IF NOT EXISTS customer_loyalty_reward_points_balance_idx ON customer_loyalty(reward_points_balance);

-- ============================================================================
-- CUSTOMER REFERRALS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS customer_referrals_referrer_customer_id_idx ON customer_referrals(referrer_customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS customer_referrals_referred_customer_id_idx ON customer_referrals(referred_customer_id);
CREATE INDEX IF NOT EXISTS customer_referrals_referral_status_idx ON customer_referrals(referral_status);
CREATE INDEX IF NOT EXISTS customer_referrals_referral_code_idx ON customer_referrals(referral_code);

-- ============================================================================
-- CUSTOMER TICKETS INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS customer_tickets_ticket_id_idx ON customer_tickets(ticket_id);
CREATE INDEX IF NOT EXISTS customer_tickets_customer_id_idx ON customer_tickets(customer_id);
CREATE INDEX IF NOT EXISTS customer_tickets_order_id_idx ON customer_tickets(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customer_tickets_status_idx ON customer_tickets(status);
CREATE INDEX IF NOT EXISTS customer_tickets_priority_idx ON customer_tickets(priority);
CREATE INDEX IF NOT EXISTS customer_tickets_assigned_to_agent_id_idx ON customer_tickets(assigned_to_agent_id) WHERE assigned_to_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customer_tickets_open_idx ON customer_tickets(status, created_at) 
  WHERE status = 'OPEN';

-- ============================================================================
-- CUSTOMER TICKET MESSAGES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS customer_ticket_messages_ticket_id_idx ON customer_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS customer_ticket_messages_sender_type_idx ON customer_ticket_messages(sender_type);
CREATE INDEX IF NOT EXISTS customer_ticket_messages_is_read_idx ON customer_ticket_messages(is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS customer_ticket_messages_created_at_idx ON customer_ticket_messages(created_at);

-- ============================================================================
-- CUSTOMER ACTIVITY LOG INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS customer_activity_log_customer_id_idx ON customer_activity_log(customer_id);
CREATE INDEX IF NOT EXISTS customer_activity_log_activity_type_idx ON customer_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS customer_activity_log_order_id_idx ON customer_activity_log(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customer_activity_log_created_at_idx ON customer_activity_log(created_at);

-- ============================================================================
-- CUSTOMER LOGIN HISTORY INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS customer_login_history_customer_id_idx ON customer_login_history(customer_id);
CREATE INDEX IF NOT EXISTS customer_login_history_login_success_idx ON customer_login_history(login_success);
CREATE INDEX IF NOT EXISTS customer_login_history_login_method_idx ON customer_login_history(login_method);
CREATE INDEX IF NOT EXISTS customer_login_history_created_at_idx ON customer_login_history(created_at);
CREATE INDEX IF NOT EXISTS customer_login_history_customer_created_idx ON customer_login_history(customer_id, created_at DESC);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX customer_wallet_transactions_customer_created_idx IS 'Optimizes queries for customer wallet transaction history';
COMMENT ON INDEX customer_coupons_active_idx IS 'Optimizes queries for active customer coupons';
COMMENT ON INDEX customer_tickets_open_idx IS 'Optimizes queries for open customer tickets';
