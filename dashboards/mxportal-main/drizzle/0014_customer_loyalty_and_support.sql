-- ============================================================================
-- CUSTOMER DOMAIN - Loyalty, Ratings, Support & Fraud
-- Migration: 0014_customer_loyalty_and_support
-- Database: Supabase PostgreSQL
-- ============================================================================

-- ============================================================================
-- PHASE 5: LOYALTY & REWARDS
-- ============================================================================

-- Customer Loyalty Program
CREATE TABLE IF NOT EXISTS customer_loyalty (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Tier
  loyalty_tier loyalty_tier NOT NULL DEFAULT 'BRONZE',
  tier_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- Order Counts (Per Service)
  total_orders INTEGER DEFAULT 0,
  food_orders_count INTEGER DEFAULT 0,
  parcel_orders_count INTEGER DEFAULT 0,
  ride_orders_count INTEGER DEFAULT 0,
  
  -- Financial
  total_spent NUMERIC(12, 2) DEFAULT 0.0,
  food_spent NUMERIC(12, 2) DEFAULT 0.0,
  parcel_spent NUMERIC(12, 2) DEFAULT 0.0,
  ride_spent NUMERIC(12, 2) DEFAULT 0.0,
  
  -- Points
  reward_points_earned INTEGER DEFAULT 0,
  reward_points_redeemed INTEGER DEFAULT 0,
  reward_points_balance INTEGER DEFAULT 0,
  
  -- Streaks
  current_order_streak INTEGER DEFAULT 0,
  longest_order_streak INTEGER DEFAULT 0,
  streak_last_order_date DATE,
  
  -- Achievements
  achievements TEXT[],
  badges TEXT[],
  
  -- Tier Benefits
  tier_benefits JSONB DEFAULT '{}',
  
  -- Last Updated
  last_order_date DATE,
  last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(customer_id)
);

CREATE INDEX IF NOT EXISTS customer_loyalty_customer_id_idx ON customer_loyalty(customer_id);
CREATE INDEX IF NOT EXISTS customer_loyalty_tier_idx ON customer_loyalty(loyalty_tier);

-- Customer Reward Points (Transaction Log)
CREATE TABLE IF NOT EXISTS customer_reward_transactions (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Transaction Details
  transaction_type TEXT NOT NULL, -- 'EARN', 'REDEEM', 'EXPIRE', 'ADJUSTMENT'
  points INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  
  -- Reference
  reference_id TEXT,
  reference_type TEXT, -- 'ORDER', 'REFERRAL', 'SIGNUP_BONUS', 'MANUAL'
  
  -- Description
  description TEXT NOT NULL,
  
  -- Expiry
  expires_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_reward_transactions_customer_id_idx ON customer_reward_transactions(customer_id);
CREATE INDEX IF NOT EXISTS customer_reward_transactions_transaction_type_idx ON customer_reward_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS customer_reward_transactions_created_at_idx ON customer_reward_transactions(created_at);

-- Customer Coupons
CREATE TABLE IF NOT EXISTS customer_coupons (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Coupon Details
  coupon_code TEXT NOT NULL,
  coupon_title TEXT,
  coupon_description TEXT,
  
  -- Coupon Type
  coupon_type TEXT NOT NULL, -- 'PERCENTAGE', 'FLAT', 'FREE_DELIVERY', 'CASHBACK'
  discount_value NUMERIC(10, 2),
  discount_percentage NUMERIC(5, 2),
  max_discount_amount NUMERIC(10, 2),
  
  -- Conditions
  min_order_amount NUMERIC(10, 2),
  applicable_services service_type[],
  applicable_merchant_ids BIGINT[],
  
  -- Usage
  usage_limit INTEGER DEFAULT 1,
  used_count INTEGER DEFAULT 0,
  
  -- Validity
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
  valid_till TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Status
  status coupon_status NOT NULL DEFAULT 'ACTIVE',
  
  -- Source
  coupon_source TEXT, -- 'SIGNUP', 'REFERRAL', 'LOYALTY', 'PROMOTION', 'COMPENSATION'
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_coupons_customer_id_idx ON customer_coupons(customer_id);
CREATE INDEX IF NOT EXISTS customer_coupons_coupon_code_idx ON customer_coupons(coupon_code);
CREATE INDEX IF NOT EXISTS customer_coupons_status_idx ON customer_coupons(status);
CREATE INDEX IF NOT EXISTS customer_coupons_validity_idx ON customer_coupons(valid_from, valid_till);

-- Customer Coupon Usage
CREATE TABLE IF NOT EXISTS customer_coupon_usage (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_coupon_id BIGINT REFERENCES customer_coupons(id) ON DELETE SET NULL,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Coupon Details (Snapshot)
  coupon_code TEXT NOT NULL,
  discount_applied NUMERIC(10, 2) NOT NULL,
  
  -- Order Details
  order_amount NUMERIC(12, 2),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_coupon_usage_customer_id_idx ON customer_coupon_usage(customer_id);
CREATE INDEX IF NOT EXISTS customer_coupon_usage_order_id_idx ON customer_coupon_usage(order_id);
CREATE INDEX IF NOT EXISTS customer_coupon_usage_coupon_code_idx ON customer_coupon_usage(coupon_code);

-- ============================================================================
-- PHASE 6: RATINGS & REVIEWS
-- ============================================================================

-- Customer Ratings Given
CREATE TABLE IF NOT EXISTS customer_ratings_given (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  
  -- Service Type
  service_type service_type NOT NULL,
  
  -- Target
  target_type TEXT NOT NULL, -- 'MERCHANT', 'RIDER', 'DRIVER', 'PLATFORM'
  target_id BIGINT,
  
  -- Rating Details
  overall_rating SMALLINT NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
  food_quality_rating SMALLINT CHECK (food_quality_rating >= 1 AND food_quality_rating <= 5),
  delivery_rating SMALLINT CHECK (delivery_rating >= 1 AND delivery_rating <= 5),
  packaging_rating SMALLINT CHECK (packaging_rating >= 1 AND packaging_rating <= 5),
  
  -- Review
  review_title TEXT,
  review_text TEXT,
  review_images TEXT[],
  
  -- Tags
  review_tags TEXT[], -- 'FRESH', 'HOT', 'LATE', 'COLD', 'DAMAGED'
  
  -- Helpful
  helpful_count INTEGER DEFAULT 0,
  not_helpful_count INTEGER DEFAULT 0,
  
  -- Response
  merchant_response TEXT,
  merchant_responded_at TIMESTAMP WITH TIME ZONE,
  
  -- Moderation
  is_verified BOOLEAN DEFAULT FALSE,
  is_featured BOOLEAN DEFAULT FALSE,
  is_flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_ratings_given_customer_id_idx ON customer_ratings_given(customer_id);
CREATE INDEX IF NOT EXISTS customer_ratings_given_order_id_idx ON customer_ratings_given(order_id);
CREATE INDEX IF NOT EXISTS customer_ratings_given_target_idx ON customer_ratings_given(target_type, target_id);
CREATE INDEX IF NOT EXISTS customer_ratings_given_service_type_idx ON customer_ratings_given(service_type);

-- Customer Ratings Received (As Passenger in Ride)
CREATE TABLE IF NOT EXISTS customer_ratings_received (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  rider_id INTEGER REFERENCES riders(id) ON DELETE SET NULL,
  
  -- Rating
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  
  -- Rating Categories
  behavior_rating SMALLINT CHECK (behavior_rating >= 1 AND behavior_rating <= 5),
  punctuality_rating SMALLINT CHECK (punctuality_rating >= 1 AND punctuality_rating <= 5),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_ratings_received_customer_id_idx ON customer_ratings_received(customer_id);
CREATE INDEX IF NOT EXISTS customer_ratings_received_order_id_idx ON customer_ratings_received(order_id);

-- Customer Review Helpfulness (Voting)
CREATE TABLE IF NOT EXISTS customer_review_helpfulness (
  id BIGSERIAL PRIMARY KEY,
  review_id BIGINT NOT NULL REFERENCES customer_ratings_given(id) ON DELETE CASCADE,
  voted_by_customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Vote
  is_helpful BOOLEAN NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(review_id, voted_by_customer_id)
);

CREATE INDEX IF NOT EXISTS customer_review_helpfulness_review_id_idx ON customer_review_helpfulness(review_id);

-- ============================================================================
-- PHASE 7: FAVORITES & PREFERENCES
-- ============================================================================

-- Customer Favorites (Merchants, Items, Routes)
CREATE TABLE IF NOT EXISTS customer_favorites (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Favorite Type
  favorite_type TEXT NOT NULL, -- 'MERCHANT', 'MENU_ITEM', 'ROUTE', 'LOCATION'
  
  -- Target
  merchant_store_id BIGINT REFERENCES merchant_stores(id) ON DELETE CASCADE,
  menu_item_id BIGINT REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  
  -- Route (for ride booking)
  route_name TEXT,
  route_from_lat NUMERIC(10, 8),
  route_from_lon NUMERIC(11, 8),
  route_to_lat NUMERIC(10, 8),
  route_to_lon NUMERIC(11, 8),
  
  -- Usage
  order_count INTEGER DEFAULT 0,
  last_ordered_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  CONSTRAINT check_favorite_target CHECK (
    (favorite_type = 'MERCHANT' AND merchant_store_id IS NOT NULL) OR
    (favorite_type = 'MENU_ITEM' AND menu_item_id IS NOT NULL) OR
    (favorite_type = 'ROUTE' AND route_name IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS customer_favorites_customer_id_idx ON customer_favorites(customer_id);
CREATE INDEX IF NOT EXISTS customer_favorites_favorite_type_idx ON customer_favorites(favorite_type);
CREATE INDEX IF NOT EXISTS customer_favorites_merchant_store_id_idx ON customer_favorites(merchant_store_id);

-- ============================================================================
-- PHASE 8: SUPPORT & DISPUTES
-- ============================================================================

-- Customer Support Tickets
CREATE TABLE IF NOT EXISTS customer_tickets (
  id BIGSERIAL PRIMARY KEY,
  ticket_id TEXT NOT NULL UNIQUE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  
  -- Service
  service_type service_type,
  
  -- Issue Details
  issue_category TEXT NOT NULL, -- 'ORDER', 'PAYMENT', 'DELIVERY', 'REFUND', 'ACCOUNT', 'TECHNICAL'
  issue_subcategory TEXT,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  
  -- Attachments
  attachments TEXT[],
  
  -- Priority
  priority TEXT NOT NULL DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL'
  
  -- Status
  status ticket_status_customer NOT NULL DEFAULT 'OPEN',
  
  -- Assignment
  assigned_to_agent_id INTEGER,
  assigned_to_agent_name TEXT,
  assigned_at TIMESTAMP WITH TIME ZONE,
  
  -- Resolution
  resolution TEXT,
  resolution_time_minutes INTEGER,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by INTEGER,
  
  -- Satisfaction
  customer_satisfaction_rating SMALLINT CHECK (customer_satisfaction_rating >= 1 AND customer_satisfaction_rating <= 5),
  
  -- Follow-up
  follow_up_required BOOLEAN DEFAULT FALSE,
  follow_up_date TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_tickets_customer_id_idx ON customer_tickets(customer_id);
CREATE INDEX IF NOT EXISTS customer_tickets_ticket_id_idx ON customer_tickets(ticket_id);
CREATE INDEX IF NOT EXISTS customer_tickets_order_id_idx ON customer_tickets(order_id);
CREATE INDEX IF NOT EXISTS customer_tickets_status_idx ON customer_tickets(status);
CREATE INDEX IF NOT EXISTS customer_tickets_priority_idx ON customer_tickets(priority);

-- Customer Ticket Messages
CREATE TABLE IF NOT EXISTS customer_ticket_messages (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES customer_tickets(id) ON DELETE CASCADE,
  
  -- Message Details
  message_text TEXT NOT NULL,
  message_type TEXT DEFAULT 'TEXT', -- 'TEXT', 'IMAGE', 'FILE', 'SYSTEM'
  
  -- Sender
  sender_type TEXT NOT NULL, -- 'CUSTOMER', 'AGENT', 'SYSTEM'
  sender_id BIGINT,
  sender_name TEXT,
  
  -- Attachments
  attachments TEXT[],
  
  -- Read Status
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_ticket_messages_ticket_id_idx ON customer_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS customer_ticket_messages_created_at_idx ON customer_ticket_messages(created_at);

-- Customer Disputes
CREATE TABLE IF NOT EXISTS customer_disputes (
  id BIGSERIAL PRIMARY KEY,
  dispute_id TEXT NOT NULL UNIQUE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ticket_id BIGINT REFERENCES customer_tickets(id) ON DELETE SET NULL,
  
  -- Dispute Details
  dispute_type TEXT NOT NULL, -- 'REFUND', 'QUALITY', 'NON_DELIVERY', 'OVERCHARGE', 'FRAUD'
  dispute_reason TEXT NOT NULL,
  dispute_description TEXT,
  
  -- Disputed Against
  disputed_against TEXT NOT NULL, -- 'MERCHANT', 'RIDER', 'PLATFORM'
  disputed_against_id BIGINT,
  
  -- Evidence
  evidence_urls TEXT[],
  evidence_description TEXT,
  
  -- Amount
  disputed_amount NUMERIC(12, 2),
  refund_amount NUMERIC(12, 2),
  
  -- Status
  dispute_status TEXT DEFAULT 'OPEN', -- 'OPEN', 'INVESTIGATING', 'RESOLVED', 'REJECTED', 'ESCALATED'
  
  -- Resolution
  resolution TEXT,
  resolution_amount NUMERIC(12, 2),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by INTEGER,
  
  -- Legal
  legal_case_number TEXT,
  legal_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_disputes_customer_id_idx ON customer_disputes(customer_id);
CREATE INDEX IF NOT EXISTS customer_disputes_order_id_idx ON customer_disputes(order_id);
CREATE INDEX IF NOT EXISTS customer_disputes_dispute_status_idx ON customer_disputes(dispute_status);

-- Customer Refund Requests
CREATE TABLE IF NOT EXISTS customer_refund_requests (
  id BIGSERIAL PRIMARY KEY,
  refund_request_id TEXT NOT NULL UNIQUE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Refund Details
  refund_type TEXT NOT NULL, -- 'FULL', 'PARTIAL', 'ITEM', 'DELIVERY_FEE'
  refund_reason TEXT NOT NULL,
  refund_reason_code TEXT,
  refund_description TEXT,
  
  -- Amount
  requested_amount NUMERIC(12, 2) NOT NULL,
  approved_amount NUMERIC(12, 2),
  
  -- Items (for partial refund)
  refund_items JSONB DEFAULT '[]',
  
  -- Status
  refund_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED'
  
  -- Processing
  processed_by INTEGER,
  processed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  
  -- Completion
  completed_at TIMESTAMP WITH TIME ZONE,
  refund_mode TEXT, -- 'ORIGINAL_PAYMENT', 'WALLET', 'COUPON'
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_refund_requests_customer_id_idx ON customer_refund_requests(customer_id);
CREATE INDEX IF NOT EXISTS customer_refund_requests_order_id_idx ON customer_refund_requests(order_id);
CREATE INDEX IF NOT EXISTS customer_refund_requests_refund_status_idx ON customer_refund_requests(refund_status);

-- ============================================================================
-- PHASE 9: FRAUD & TRUST
-- ============================================================================

-- Customer Trust Score Tracking
CREATE TABLE IF NOT EXISTS customer_trust_score (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Trust Score Components
  trust_score NUMERIC(5, 2) DEFAULT 100.0,
  fraud_score NUMERIC(5, 2) DEFAULT 0.0,
  risk_level risk_level DEFAULT 'LOW',
  
  -- Score Breakdown
  payment_reliability_score NUMERIC(5, 2) DEFAULT 100.0,
  order_completion_score NUMERIC(5, 2) DEFAULT 100.0,
  false_complaint_score NUMERIC(5, 2) DEFAULT 100.0,
  verification_score NUMERIC(5, 2) DEFAULT 100.0,
  
  -- Flags
  is_fraudulent BOOLEAN DEFAULT FALSE,
  is_suspicious BOOLEAN DEFAULT FALSE,
  requires_review BOOLEAN DEFAULT FALSE,
  
  -- Last Calculated
  last_calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(customer_id)
);

CREATE INDEX IF NOT EXISTS customer_trust_score_customer_id_idx ON customer_trust_score(customer_id);
CREATE INDEX IF NOT EXISTS customer_trust_score_risk_level_idx ON customer_trust_score(risk_level);
CREATE INDEX IF NOT EXISTS customer_trust_score_is_fraudulent_idx ON customer_trust_score(is_fraudulent) WHERE is_fraudulent = TRUE;

-- Customer Fraud Alerts
CREATE TABLE IF NOT EXISTS customer_fraud_alerts (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  
  -- Alert Details
  alert_type TEXT NOT NULL, -- 'PAYMENT_FRAUD', 'FALSE_COMPLAINT', 'LOCATION_MISMATCH', 'DEVICE_MISMATCH', 'MULTIPLE_ACCOUNTS'
  alert_severity risk_level NOT NULL DEFAULT 'MEDIUM',
  alert_description TEXT NOT NULL,
  
  -- Evidence
  evidence JSONB DEFAULT '{}',
  
  -- Action Taken
  action_taken TEXT,
  action_taken_at TIMESTAMP WITH TIME ZONE,
  action_taken_by INTEGER,
  
  -- Resolution
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_fraud_alerts_customer_id_idx ON customer_fraud_alerts(customer_id);
CREATE INDEX IF NOT EXISTS customer_fraud_alerts_alert_type_idx ON customer_fraud_alerts(alert_type);
CREATE INDEX IF NOT EXISTS customer_fraud_alerts_is_resolved_idx ON customer_fraud_alerts(is_resolved) WHERE is_resolved = FALSE;

-- Customer Blocks
CREATE TABLE IF NOT EXISTS customer_blocks (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Block Details
  block_type TEXT NOT NULL, -- 'SERVICE_BLOCK', 'ACCOUNT_BLOCK', 'PAYMENT_BLOCK'
  service_type service_type, -- NULL means all services
  
  -- Reason
  block_reason TEXT NOT NULL,
  block_reason_code TEXT,
  block_notes TEXT,
  
  -- Actor
  blocked_by TEXT NOT NULL, -- 'SYSTEM', 'ADMIN', 'FRAUD_DETECTION'
  blocked_by_id INTEGER,
  blocked_by_name TEXT,
  
  -- Duration
  blocked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMP WITH TIME ZONE,
  auto_unblock BOOLEAN DEFAULT FALSE,
  
  -- Unblock
  is_unblocked BOOLEAN DEFAULT FALSE,
  unblocked_at TIMESTAMP WITH TIME ZONE,
  unblocked_by INTEGER,
  unblock_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_blocks_customer_id_idx ON customer_blocks(customer_id);
CREATE INDEX IF NOT EXISTS customer_blocks_service_type_idx ON customer_blocks(service_type);
CREATE INDEX IF NOT EXISTS customer_blocks_is_unblocked_idx ON customer_blocks(is_unblocked) WHERE is_unblocked = FALSE;

-- Customer Suspicious Activity
CREATE TABLE IF NOT EXISTS customer_suspicious_activity (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Activity Details
  activity_type TEXT NOT NULL, -- 'UNUSUAL_ORDER_PATTERN', 'LOCATION_JUMP', 'PAYMENT_FAILURE_SPIKE', 'MULTIPLE_CANCELLATIONS'
  activity_description TEXT NOT NULL,
  
  -- Detection
  detected_by TEXT NOT NULL, -- 'SYSTEM', 'ML_MODEL', 'MANUAL_REVIEW'
  detection_confidence NUMERIC(5, 2), -- 0-100
  
  -- Risk
  risk_score NUMERIC(5, 2),
  
  -- Evidence
  evidence JSONB DEFAULT '{}',
  
  -- Review
  requires_review BOOLEAN DEFAULT TRUE,
  reviewed BOOLEAN DEFAULT FALSE,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by INTEGER,
  review_notes TEXT,
  
  -- Action
  action_recommended TEXT,
  action_taken TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_suspicious_activity_customer_id_idx ON customer_suspicious_activity(customer_id);
CREATE INDEX IF NOT EXISTS customer_suspicious_activity_activity_type_idx ON customer_suspicious_activity(activity_type);
CREATE INDEX IF NOT EXISTS customer_suspicious_activity_requires_review_idx ON customer_suspicious_activity(requires_review) WHERE requires_review = TRUE;

-- Customer Verification History
CREATE TABLE IF NOT EXISTS customer_verification_history (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Verification Details
  verification_type verification_type NOT NULL,
  verification_method TEXT, -- 'OTP', 'EMAIL_LINK', 'DOCUMENT', 'BIOMETRIC'
  
  -- Status
  verification_status TEXT NOT NULL, -- 'INITIATED', 'SUCCESS', 'FAILED', 'EXPIRED'
  
  -- Attempts
  attempt_number INTEGER DEFAULT 1,
  
  -- Failure
  failure_reason TEXT,
  
  -- IP & Device
  ip_address TEXT,
  device_id TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_verification_history_customer_id_idx ON customer_verification_history(customer_id);
CREATE INDEX IF NOT EXISTS customer_verification_history_verification_type_idx ON customer_verification_history(verification_type);
CREATE INDEX IF NOT EXISTS customer_verification_history_created_at_idx ON customer_verification_history(created_at);

-- Continue in Part 3...
