-- ============================================================================
-- CRITICAL INDEXES - PART 4: Merchant Domain
-- Migration: 0025_critical_indexes_part4
-- Database: Supabase PostgreSQL
-- 
-- This file adds indexes for merchant-related tables
-- ============================================================================

-- ============================================================================
-- MERCHANT PARENTS INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS merchant_parents_parent_merchant_id_idx ON merchant_parents(parent_merchant_id);
CREATE UNIQUE INDEX IF NOT EXISTS merchant_parents_registered_phone_idx ON merchant_parents(registered_phone);
CREATE UNIQUE INDEX IF NOT EXISTS merchant_parents_email_idx ON merchant_parents(owner_email) WHERE owner_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_parents_status_idx ON merchant_parents(status);
CREATE INDEX IF NOT EXISTS merchant_parents_is_active_idx ON merchant_parents(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS merchant_parents_merchant_type_idx ON merchant_parents(merchant_type);

-- ============================================================================
-- MERCHANT STORES INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS merchant_stores_store_id_idx ON merchant_stores(store_id);
CREATE INDEX IF NOT EXISTS merchant_stores_parent_id_idx ON merchant_stores(parent_id);
CREATE INDEX IF NOT EXISTS merchant_stores_status_idx ON merchant_stores(status);
CREATE INDEX IF NOT EXISTS merchant_stores_is_active_idx ON merchant_stores(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS merchant_stores_is_accepting_orders_idx ON merchant_stores(is_accepting_orders) WHERE is_accepting_orders = TRUE;
CREATE INDEX IF NOT EXISTS merchant_stores_city_idx ON merchant_stores(city);
CREATE INDEX IF NOT EXISTS merchant_stores_status_active_idx ON merchant_stores(status, is_active) WHERE status = 'ACTIVE' AND is_active = TRUE;

-- ============================================================================
-- MERCHANT STORE ORDERS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS merchant_store_orders_store_id_idx ON merchant_store_orders(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_orders_merchant_id_idx ON merchant_store_orders(merchant_id) WHERE merchant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_store_orders_order_id_idx ON merchant_store_orders(order_id);
CREATE INDEX IF NOT EXISTS merchant_store_orders_order_status_idx ON merchant_store_orders(order_status);
CREATE INDEX IF NOT EXISTS merchant_store_orders_service_type_idx ON merchant_store_orders(service_type);
CREATE INDEX IF NOT EXISTS merchant_store_orders_store_status_idx ON merchant_store_orders(store_id, order_status);

-- ============================================================================
-- MERCHANT STORE PAYOUTS INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS merchant_store_payouts_payout_id_idx ON merchant_store_payouts(payout_id);
CREATE INDEX IF NOT EXISTS merchant_store_payouts_store_id_idx ON merchant_store_payouts(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_payouts_parent_id_idx ON merchant_store_payouts(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_store_payouts_status_idx ON merchant_store_payouts(status);
CREATE INDEX IF NOT EXISTS merchant_store_payouts_bank_account_id_idx ON merchant_store_payouts(bank_account_id) WHERE bank_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_store_payouts_period_idx ON merchant_store_payouts(period_start_date, period_end_date);
CREATE INDEX IF NOT EXISTS merchant_store_payouts_pending_idx ON merchant_store_payouts(status, requested_at) 
  WHERE status = 'PENDING';

-- ============================================================================
-- MERCHANT STORE SETTLEMENTS INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS merchant_store_settlements_settlement_id_idx ON merchant_store_settlements(settlement_id);
CREATE INDEX IF NOT EXISTS merchant_store_settlements_store_id_idx ON merchant_store_settlements(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_settlements_payout_id_idx ON merchant_store_settlements(payout_id) WHERE payout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_store_settlements_settlement_status_idx ON merchant_store_settlements(settlement_status);
CREATE INDEX IF NOT EXISTS merchant_store_settlements_settlement_date_idx ON merchant_store_settlements(settlement_date);
CREATE INDEX IF NOT EXISTS merchant_store_settlements_period_idx ON merchant_store_settlements(period_start_date, period_end_date);

-- ============================================================================
-- MERCHANT STORE BANK ACCOUNTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS merchant_store_bank_accounts_store_id_idx ON merchant_store_bank_accounts(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_bank_accounts_is_primary_idx ON merchant_store_bank_accounts(is_primary) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS merchant_store_bank_accounts_is_active_idx ON merchant_store_bank_accounts(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS merchant_store_bank_accounts_is_verified_idx ON merchant_store_bank_accounts(is_verified) WHERE is_verified = TRUE;

-- ============================================================================
-- MERCHANT STORE AVAILABILITY INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS merchant_store_availability_store_id_idx ON merchant_store_availability(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_availability_is_available_idx ON merchant_store_availability(is_available) WHERE is_available = TRUE;
CREATE INDEX IF NOT EXISTS merchant_store_availability_is_accepting_orders_idx ON merchant_store_availability(is_accepting_orders) WHERE is_accepting_orders = TRUE;

-- ============================================================================
-- MERCHANT STORE RATINGS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS merchant_store_ratings_store_id_idx ON merchant_store_ratings(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_ratings_order_id_idx ON merchant_store_ratings(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_store_ratings_customer_id_idx ON merchant_store_ratings(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_store_ratings_rating_idx ON merchant_store_ratings(rating);
CREATE INDEX IF NOT EXISTS merchant_store_ratings_created_at_idx ON merchant_store_ratings(created_at);

-- ============================================================================
-- MERCHANT MENU ITEMS INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS merchant_menu_items_item_id_idx ON merchant_menu_items(item_id);
CREATE INDEX IF NOT EXISTS merchant_menu_items_store_id_idx ON merchant_menu_items(store_id);
CREATE INDEX IF NOT EXISTS merchant_menu_items_category_id_idx ON merchant_menu_items(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_menu_items_is_active_idx ON merchant_menu_items(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS merchant_menu_items_in_stock_idx ON merchant_menu_items(in_stock) WHERE in_stock = TRUE;
CREATE INDEX IF NOT EXISTS merchant_menu_items_store_active_idx ON merchant_menu_items(store_id, is_active) WHERE is_active = TRUE;

-- ============================================================================
-- MERCHANT MENU CATEGORIES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS merchant_menu_categories_store_id_idx ON merchant_menu_categories(store_id);
CREATE INDEX IF NOT EXISTS merchant_menu_categories_is_active_idx ON merchant_menu_categories(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS merchant_menu_categories_display_order_idx ON merchant_menu_categories(display_order);

-- ============================================================================
-- MERCHANT COUPONS INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS merchant_coupons_coupon_id_idx ON merchant_coupons(coupon_id);
CREATE UNIQUE INDEX IF NOT EXISTS merchant_coupons_coupon_code_idx ON merchant_coupons(coupon_code);
CREATE INDEX IF NOT EXISTS merchant_coupons_store_id_idx ON merchant_coupons(store_id) WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_coupons_parent_id_idx ON merchant_coupons(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_coupons_is_active_idx ON merchant_coupons(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS merchant_coupons_valid_from_idx ON merchant_coupons(valid_from);
CREATE INDEX IF NOT EXISTS merchant_coupons_valid_till_idx ON merchant_coupons(valid_till);
-- Note: Cannot use NOW() in index predicate (not IMMUTABLE)
-- Index on is_active and valid_till - application should filter by current date
CREATE INDEX IF NOT EXISTS merchant_coupons_active_idx ON merchant_coupons(store_id, is_active, valid_till) 
  WHERE is_active = TRUE;

-- ============================================================================
-- MERCHANT OFFERS INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS merchant_offers_offer_id_idx ON merchant_offers(offer_id);
CREATE INDEX IF NOT EXISTS merchant_offers_store_id_idx ON merchant_offers(store_id);
CREATE INDEX IF NOT EXISTS merchant_offers_offer_type_idx ON merchant_offers(offer_type);
CREATE INDEX IF NOT EXISTS merchant_offers_is_active_idx ON merchant_offers(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS merchant_offers_is_featured_idx ON merchant_offers(is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS merchant_offers_valid_from_idx ON merchant_offers(valid_from);
CREATE INDEX IF NOT EXISTS merchant_offers_valid_till_idx ON merchant_offers(valid_till);

-- ============================================================================
-- MERCHANT STORE DOCUMENTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS merchant_store_documents_store_id_idx ON merchant_store_documents(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_documents_document_type_idx ON merchant_store_documents(document_type);
CREATE INDEX IF NOT EXISTS merchant_store_documents_is_verified_idx ON merchant_store_documents(is_verified) WHERE is_verified = TRUE;
CREATE INDEX IF NOT EXISTS merchant_store_documents_is_latest_idx ON merchant_store_documents(is_latest) WHERE is_latest = TRUE;

-- ============================================================================
-- MERCHANT STORE VERIFICATION INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS merchant_store_verification_store_id_idx ON merchant_store_verification(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_verification_verification_type_idx ON merchant_store_verification(verification_type);
CREATE INDEX IF NOT EXISTS merchant_store_verification_verification_status_idx ON merchant_store_verification(verification_status);
CREATE INDEX IF NOT EXISTS merchant_store_verification_pending_idx ON merchant_store_verification(verification_status, created_at) 
  WHERE verification_status = 'PENDING';

-- ============================================================================
-- MERCHANT STORE COMMISSION RULES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS merchant_store_commission_rules_store_id_idx ON merchant_store_commission_rules(store_id) WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_store_commission_rules_parent_id_idx ON merchant_store_commission_rules(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_store_commission_rules_service_type_idx ON merchant_store_commission_rules(service_type);
CREATE INDEX IF NOT EXISTS merchant_store_commission_rules_is_active_idx ON merchant_store_commission_rules(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS merchant_store_commission_rules_effective_from_idx ON merchant_store_commission_rules(effective_from);

-- ============================================================================
-- MERCHANT STORE OPERATING HOURS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS merchant_store_operating_hours_store_id_idx ON merchant_store_operating_hours(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_operating_hours_day_of_week_idx ON merchant_store_operating_hours(day_of_week);
CREATE INDEX IF NOT EXISTS merchant_store_operating_hours_is_open_idx ON merchant_store_operating_hours(is_open) WHERE is_open = TRUE;

-- ============================================================================
-- MERCHANT STORE DAILY ANALYTICS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS merchant_store_daily_analytics_store_id_idx ON merchant_store_daily_analytics(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_daily_analytics_analytics_date_idx ON merchant_store_daily_analytics(analytics_date);
CREATE UNIQUE INDEX IF NOT EXISTS merchant_store_daily_analytics_store_date_idx ON merchant_store_daily_analytics(store_id, analytics_date);

-- ============================================================================
-- MERCHANT USERS INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS merchant_users_user_id_idx ON merchant_users(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS merchant_users_email_idx ON merchant_users(email);
CREATE UNIQUE INDEX IF NOT EXISTS merchant_users_mobile_idx ON merchant_users(mobile);
CREATE INDEX IF NOT EXISTS merchant_users_parent_id_idx ON merchant_users(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_users_is_active_idx ON merchant_users(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- MERCHANT USER STORE ACCESS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS merchant_user_store_access_user_id_idx ON merchant_user_store_access(user_id);
CREATE INDEX IF NOT EXISTS merchant_user_store_access_store_id_idx ON merchant_user_store_access(store_id);
CREATE INDEX IF NOT EXISTS merchant_user_store_access_is_active_idx ON merchant_user_store_access(is_active) WHERE is_active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS merchant_user_store_access_user_store_idx ON merchant_user_store_access(user_id, store_id) WHERE is_active = TRUE;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX merchant_store_payouts_pending_idx IS 'Optimizes queries for pending merchant payouts';
COMMENT ON INDEX merchant_coupons_active_idx IS 'Optimizes queries for active merchant coupons';
COMMENT ON INDEX merchant_store_daily_analytics_store_date_idx IS 'Ensures one analytics record per store per day';
