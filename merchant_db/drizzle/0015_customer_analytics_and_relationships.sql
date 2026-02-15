-- ============================================================================
-- CUSTOMER DOMAIN - Analytics, Activity, Referrals & Relationships
-- Migration: 0015_customer_analytics_and_relationships
-- Database: Supabase PostgreSQL
-- ============================================================================

-- ============================================================================
-- PHASE 10: ACTIVITY & ANALYTICS
-- ============================================================================

-- Customer Activity Log
CREATE TABLE IF NOT EXISTS customer_activity_log (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Activity Details
  activity_type TEXT NOT NULL, -- 'LOGIN', 'LOGOUT', 'ORDER_PLACED', 'ORDER_CANCELLED', 'PAYMENT_FAILED', 'ADDRESS_ADDED', etc.
  activity_description TEXT,
  
  -- Context
  service_type service_type,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  
  -- Device & Location
  device_id TEXT,
  ip_address TEXT,
  location_lat NUMERIC(10, 8),
  location_lon NUMERIC(11, 8),
  
  -- Metadata
  activity_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_activity_log_customer_id_idx ON customer_activity_log(customer_id);
CREATE INDEX IF NOT EXISTS customer_activity_log_activity_type_idx ON customer_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS customer_activity_log_created_at_idx ON customer_activity_log(created_at);
CREATE INDEX IF NOT EXISTS customer_activity_log_customer_created_idx ON customer_activity_log(customer_id, created_at DESC);

-- Customer Login History
CREATE TABLE IF NOT EXISTS customer_login_history (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Login Details
  login_method TEXT NOT NULL, -- 'OTP', 'PASSWORD', 'GOOGLE', 'FACEBOOK', 'BIOMETRIC'
  login_success BOOLEAN DEFAULT TRUE,
  
  -- Device
  device_id TEXT,
  device_type device_platform,
  device_model TEXT,
  
  -- Network
  ip_address TEXT,
  ip_location TEXT,
  user_agent TEXT,
  
  -- Failure
  failure_reason TEXT,
  
  -- Session
  session_id BIGINT REFERENCES customer_sessions(id) ON DELETE SET NULL,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_login_history_customer_id_idx ON customer_login_history(customer_id);
CREATE INDEX IF NOT EXISTS customer_login_history_login_success_idx ON customer_login_history(login_success);
CREATE INDEX IF NOT EXISTS customer_login_history_created_at_idx ON customer_login_history(created_at);

-- Customer Daily Analytics
CREATE TABLE IF NOT EXISTS customer_daily_analytics (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  analytics_date DATE NOT NULL,
  
  -- Order Metrics
  total_orders INTEGER DEFAULT 0,
  completed_orders INTEGER DEFAULT 0,
  cancelled_orders INTEGER DEFAULT 0,
  
  -- Service Breakdown
  food_orders INTEGER DEFAULT 0,
  parcel_orders INTEGER DEFAULT 0,
  ride_orders INTEGER DEFAULT 0,
  
  -- Financial
  total_spent NUMERIC(12, 2) DEFAULT 0.0,
  total_saved NUMERIC(12, 2) DEFAULT 0.0,
  tips_given NUMERIC(10, 2) DEFAULT 0.0,
  
  -- Ratings
  avg_rating_given NUMERIC(3, 2),
  ratings_count INTEGER DEFAULT 0,
  
  -- Activity
  app_opens INTEGER DEFAULT 0,
  time_spent_minutes INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(customer_id, analytics_date)
);

CREATE INDEX IF NOT EXISTS customer_daily_analytics_customer_id_idx ON customer_daily_analytics(customer_id);
CREATE INDEX IF NOT EXISTS customer_daily_analytics_date_idx ON customer_daily_analytics(analytics_date);

-- Customer Service Analytics (Per Service)
CREATE TABLE IF NOT EXISTS customer_service_analytics (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_type service_type NOT NULL,
  
  -- Order Metrics
  total_orders INTEGER DEFAULT 0,
  completed_orders INTEGER DEFAULT 0,
  cancelled_orders INTEGER DEFAULT 0,
  cancellation_rate NUMERIC(5, 2) DEFAULT 0.0,
  
  -- Financial
  total_spent NUMERIC(12, 2) DEFAULT 0.0,
  average_order_value NUMERIC(10, 2) DEFAULT 0.0,
  
  -- Frequency
  first_order_at TIMESTAMP WITH TIME ZONE,
  last_order_at TIMESTAMP WITH TIME ZONE,
  avg_days_between_orders NUMERIC(5, 2),
  
  -- Ratings
  avg_rating_given NUMERIC(3, 2),
  ratings_given_count INTEGER DEFAULT 0,
  
  -- Favorite Merchants (Top 3)
  favorite_merchant_ids BIGINT[],
  
  -- Last Updated
  last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(customer_id, service_type)
);

CREATE INDEX IF NOT EXISTS customer_service_analytics_customer_id_idx ON customer_service_analytics(customer_id);
CREATE INDEX IF NOT EXISTS customer_service_analytics_service_type_idx ON customer_service_analytics(service_type);

-- ============================================================================
-- PHASE 11: REFERRALS & SOCIAL
-- ============================================================================

-- Customer Referrals
CREATE TABLE IF NOT EXISTS customer_referrals (
  id BIGSERIAL PRIMARY KEY,
  referrer_customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  referred_customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Referral Details
  referral_code TEXT NOT NULL,
  
  -- Status
  referral_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'COMPLETED', 'EXPIRED'
  
  -- Rewards
  referrer_reward_amount NUMERIC(10, 2),
  referrer_reward_type TEXT, -- 'CASH', 'COUPON', 'POINTS'
  referrer_reward_given BOOLEAN DEFAULT FALSE,
  referrer_reward_given_at TIMESTAMP WITH TIME ZONE,
  
  referred_reward_amount NUMERIC(10, 2),
  referred_reward_type TEXT,
  referred_reward_given BOOLEAN DEFAULT FALSE,
  referred_reward_given_at TIMESTAMP WITH TIME ZONE,
  
  -- Completion Criteria
  required_orders INTEGER DEFAULT 1,
  completed_orders INTEGER DEFAULT 0,
  completion_deadline TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(referred_customer_id)
);

CREATE INDEX IF NOT EXISTS customer_referrals_referrer_id_idx ON customer_referrals(referrer_customer_id);
CREATE INDEX IF NOT EXISTS customer_referrals_referred_id_idx ON customer_referrals(referred_customer_id);
CREATE INDEX IF NOT EXISTS customer_referrals_referral_code_idx ON customer_referrals(referral_code);
CREATE INDEX IF NOT EXISTS customer_referrals_status_idx ON customer_referrals(referral_status);

-- Customer Referral Rewards
CREATE TABLE IF NOT EXISTS customer_referral_rewards (
  id BIGSERIAL PRIMARY KEY,
  referral_id BIGINT NOT NULL REFERENCES customer_referrals(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Reward Details
  reward_type TEXT NOT NULL, -- 'REFERRER', 'REFERRED'
  reward_amount NUMERIC(10, 2) NOT NULL,
  reward_mode TEXT, -- 'WALLET', 'COUPON', 'POINTS'
  
  -- Coupon (if applicable)
  coupon_code TEXT,
  coupon_id BIGINT REFERENCES customer_coupons(id) ON DELETE SET NULL,
  
  -- Status
  reward_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'CREDITED', 'FAILED', 'EXPIRED'
  credited_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_referral_rewards_referral_id_idx ON customer_referral_rewards(referral_id);
CREATE INDEX IF NOT EXISTS customer_referral_rewards_customer_id_idx ON customer_referral_rewards(customer_id);
CREATE INDEX IF NOT EXISTS customer_referral_rewards_reward_status_idx ON customer_referral_rewards(reward_status);

-- ============================================================================
-- PHASE 12: COMPLIANCE & LEGAL
-- ============================================================================

-- Customer Consent Log (GDPR Compliance)
CREATE TABLE IF NOT EXISTS customer_consent_log (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Consent Details
  consent_type TEXT NOT NULL, -- 'TERMS_AND_CONDITIONS', 'PRIVACY_POLICY', 'MARKETING', 'DATA_SHARING', 'LOCATION_TRACKING'
  consent_version TEXT NOT NULL,
  
  -- Consent Status
  consent_given BOOLEAN NOT NULL,
  consent_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Withdrawal
  consent_withdrawn BOOLEAN DEFAULT FALSE,
  consent_withdrawn_at TIMESTAMP WITH TIME ZONE,
  
  -- Context
  ip_address TEXT,
  device_id TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_consent_log_customer_id_idx ON customer_consent_log(customer_id);
CREATE INDEX IF NOT EXISTS customer_consent_log_consent_type_idx ON customer_consent_log(consent_type);
CREATE INDEX IF NOT EXISTS customer_consent_log_consent_date_idx ON customer_consent_log(consent_date);

-- Customer Data Deletion Requests (GDPR Right to be Forgotten)
CREATE TABLE IF NOT EXISTS customer_data_deletion_requests (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Request Details
  deletion_reason TEXT NOT NULL,
  deletion_type TEXT DEFAULT 'FULL', -- 'FULL', 'PARTIAL'
  data_categories TEXT[], -- Which data to delete
  
  -- Retention
  retain_order_history BOOLEAN DEFAULT TRUE,
  retain_payment_history BOOLEAN DEFAULT TRUE,
  
  -- Status
  request_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED'
  
  -- Processing
  approved_by INTEGER,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  
  -- Execution
  deletion_started_at TIMESTAMP WITH TIME ZONE,
  deletion_completed_at TIMESTAMP WITH TIME ZONE,
  deletion_report JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_data_deletion_requests_customer_id_idx ON customer_data_deletion_requests(customer_id);
CREATE INDEX IF NOT EXISTS customer_data_deletion_requests_status_idx ON customer_data_deletion_requests(request_status);

-- Customer Audit Log
CREATE TABLE IF NOT EXISTS customer_audit_log (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Action Details
  action_type TEXT NOT NULL, -- 'PROFILE_UPDATE', 'ADDRESS_ADD', 'PAYMENT_METHOD_ADD', 'ORDER_PLACED', etc.
  action_field TEXT,
  old_value JSONB,
  new_value JSONB,
  
  -- Actor
  actor_type TEXT NOT NULL, -- 'CUSTOMER', 'ADMIN', 'SYSTEM'
  actor_id BIGINT,
  actor_name TEXT,
  
  -- Context
  ip_address TEXT,
  device_id TEXT,
  user_agent TEXT,
  
  -- Metadata
  audit_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_audit_log_customer_id_idx ON customer_audit_log(customer_id);
CREATE INDEX IF NOT EXISTS customer_audit_log_action_type_idx ON customer_audit_log(action_type);
CREATE INDEX IF NOT EXISTS customer_audit_log_created_at_idx ON customer_audit_log(created_at);

-- ============================================================================
-- PHASE 13: ORDER RELATIONSHIPS
-- ============================================================================

-- Customer Orders Summary (Link Table)
CREATE TABLE IF NOT EXISTS customer_orders_summary (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Service
  service_type service_type NOT NULL,
  order_type order_type NOT NULL,
  
  -- Financial
  order_value NUMERIC(12, 2) DEFAULT 0.0,
  discount_applied NUMERIC(10, 2) DEFAULT 0.0,
  amount_paid NUMERIC(12, 2) DEFAULT 0.0,
  
  -- Status
  order_status order_status_type,
  
  -- Timestamps
  order_placed_at TIMESTAMP WITH TIME ZONE,
  order_completed_at TIMESTAMP WITH TIME ZONE,
  order_cancelled_at TIMESTAMP WITH TIME ZONE,
  
  -- Ratings
  customer_rating_given SMALLINT,
  customer_review_given BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(customer_id, order_id)
);

CREATE INDEX IF NOT EXISTS customer_orders_summary_customer_id_idx ON customer_orders_summary(customer_id);
CREATE INDEX IF NOT EXISTS customer_orders_summary_order_id_idx ON customer_orders_summary(order_id);
CREATE INDEX IF NOT EXISTS customer_orders_summary_service_type_idx ON customer_orders_summary(service_type);
CREATE INDEX IF NOT EXISTS customer_orders_summary_order_status_idx ON customer_orders_summary(order_status);

-- Link orders to customers
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders(customer_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Auto-update updated_at
CREATE TRIGGER customers_updated_at_trigger
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER customer_auth_updated_at_trigger
  BEFORE UPDATE ON customer_auth
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER customer_devices_updated_at_trigger
  BEFORE UPDATE ON customer_devices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER customer_addresses_updated_at_trigger
  BEFORE UPDATE ON customer_addresses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER customer_payment_methods_updated_at_trigger
  BEFORE UPDATE ON customer_payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER customer_wallet_updated_at_trigger
  BEFORE UPDATE ON customer_wallet
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER customer_coupons_updated_at_trigger
  BEFORE UPDATE ON customer_coupons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER customer_loyalty_updated_at_trigger
  BEFORE UPDATE ON customer_loyalty
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER customer_tickets_updated_at_trigger
  BEFORE UPDATE ON customer_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Create profile history on update
CREATE OR REPLACE FUNCTION create_customer_profile_history()
RETURNS TRIGGER AS $$
DECLARE
  changed_field TEXT;
  old_val TEXT;
  new_val TEXT;
BEGIN
  -- Track specific field changes
  IF OLD.full_name IS DISTINCT FROM NEW.full_name THEN
    INSERT INTO customer_profiles_history (customer_id, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'full_name', OLD.full_name, NEW.full_name, 'CUSTOMER');
  END IF;
  
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    INSERT INTO customer_profiles_history (customer_id, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'email', OLD.email, NEW.email, 'CUSTOMER');
  END IF;
  
  IF OLD.primary_mobile IS DISTINCT FROM NEW.primary_mobile THEN
    INSERT INTO customer_profiles_history (customer_id, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'primary_mobile', OLD.primary_mobile, NEW.primary_mobile, 'CUSTOMER');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_profile_history_trigger
  AFTER UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION create_customer_profile_history();

-- Trigger: Create address history on change
CREATE OR REPLACE FUNCTION create_customer_address_history()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO customer_address_history (
    address_id, customer_id, address_snapshot, change_type, changed_fields
  ) VALUES (
    NEW.id, NEW.customer_id, row_to_json(NEW)::jsonb, TG_OP, ARRAY[]::TEXT[]
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_addresses_history_trigger
  AFTER INSERT OR UPDATE ON customer_addresses
  FOR EACH ROW
  EXECUTE FUNCTION create_customer_address_history();

-- Trigger: Update wallet balance
CREATE OR REPLACE FUNCTION update_customer_wallet_balance()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE customer_wallet
  SET current_balance = NEW.balance_after,
      available_balance = NEW.balance_after - locked_amount,
      last_transaction_at = NEW.created_at,
      updated_at = NOW()
  WHERE customer_id = NEW.customer_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_wallet_transactions_balance_trigger
  AFTER INSERT ON customer_wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_wallet_balance();

-- Trigger: Update loyalty on order completion
CREATE OR REPLACE FUNCTION update_customer_loyalty()
RETURNS TRIGGER AS $$
BEGIN
  -- This will be called by application when order is completed
  -- Can also be automated via trigger on orders table
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CONSTRAINTS
-- ============================================================================

-- Customers
ALTER TABLE customers
  ADD CONSTRAINT customers_mobile_format CHECK (primary_mobile ~ '^\+?[0-9]{10,15}$'),
  ADD CONSTRAINT customers_trust_score_range CHECK (trust_score >= 0 AND trust_score <= 100),
  ADD CONSTRAINT customers_fraud_score_range CHECK (fraud_score >= 0 AND fraud_score <= 100),
  ADD CONSTRAINT customers_wallet_balance_positive CHECK (wallet_balance >= 0);

-- Addresses
ALTER TABLE customer_addresses
  ADD CONSTRAINT customer_addresses_latitude_valid CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  ADD CONSTRAINT customer_addresses_longitude_valid CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));

-- Wallet
ALTER TABLE customer_wallet
  ADD CONSTRAINT customer_wallet_balance_positive CHECK (current_balance >= 0),
  ADD CONSTRAINT customer_wallet_locked_positive CHECK (locked_amount >= 0),
  ADD CONSTRAINT customer_wallet_available_positive CHECK (available_balance >= 0);

-- Wallet Transactions
ALTER TABLE customer_wallet_transactions
  ADD CONSTRAINT customer_wallet_transactions_amount_positive CHECK (amount >= 0);

-- Tips
ALTER TABLE customer_tips_given
  ADD CONSTRAINT customer_tips_amount_positive CHECK (tip_amount > 0);

-- Ratings
ALTER TABLE customer_ratings_given
  ADD CONSTRAINT customer_ratings_given_rating_range CHECK (overall_rating >= 1 AND overall_rating <= 5);

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_profiles_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_address_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_saved_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_privacy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tips_given ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_loyalty ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_reward_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_coupon_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_ratings_given ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_ratings_received ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_review_helpfulness ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_trust_score ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_fraud_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_suspicious_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_verification_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_daily_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_service_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_consent_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_data_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_orders_summary ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function: Get customer profile with stats
CREATE OR REPLACE FUNCTION get_customer_profile(p_customer_id BIGINT)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'profile', row_to_json(c.*),
    'loyalty', row_to_json(cl.*),
    'trust_score', row_to_json(cts.*),
    'wallet', row_to_json(cw.*),
    'total_orders', (SELECT COUNT(*) FROM customer_orders_summary WHERE customer_id = p_customer_id),
    'default_address', (SELECT row_to_json(ca.*) FROM customer_addresses ca WHERE ca.customer_id = p_customer_id AND ca.is_default = TRUE LIMIT 1)
  ) INTO v_result
  FROM customers c
  LEFT JOIN customer_loyalty cl ON c.id = cl.customer_id
  LEFT JOIN customer_trust_score cts ON c.id = cts.customer_id
  LEFT JOIN customer_wallet cw ON c.id = cw.customer_id
  WHERE c.id = p_customer_id;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE customers IS 'Core customer profile. Single customer ID across all services (food, parcel, ride).';
COMMENT ON TABLE customer_addresses IS 'Customer delivery/pickup addresses with versioning support.';
COMMENT ON TABLE customer_wallet IS 'Customer wallet for cashless transactions. KYC required for higher limits.';
COMMENT ON TABLE customer_loyalty IS 'Customer loyalty program with tiered benefits.';
COMMENT ON TABLE customer_tickets IS 'Customer support tickets with conversation tracking.';
COMMENT ON TABLE customer_audit_log IS 'Complete audit trail for all customer-related changes.';
