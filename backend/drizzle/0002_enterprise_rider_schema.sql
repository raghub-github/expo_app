-- Enterprise-Grade Rider-Based Gig-Economy Logistics DBMS Schema
-- Migration: 0002_enterprise_rider_schema
-- Database: Supabase PostgreSQL
-- ORM: Drizzle

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE onboarding_stage AS ENUM (
  'MOBILE_VERIFIED',
  'KYC',
  'PAYMENT',
  'APPROVAL',
  'ACTIVE'
);

CREATE TYPE kyc_status AS ENUM (
  'PENDING',
  'REJECTED',
  'APPROVED',
  'REVIEW'
);

CREATE TYPE rider_status AS ENUM (
  'INACTIVE',
  'ACTIVE',
  'BLOCKED',
  'BANNED'
);

CREATE TYPE document_type AS ENUM (
  'aadhaar',
  'dl',
  'rc',
  'pan',
  'selfie',
  'rental_proof',
  'ev_proof'
);

CREATE TYPE duty_status AS ENUM (
  'ON',
  'OFF',
  'AUTO_OFF'
);

CREATE TYPE order_type AS ENUM (
  'food',
  'parcel',
  'ride',
  '3pl'
);

CREATE TYPE order_status_type AS ENUM (
  'assigned',
  'accepted',
  'reached_store',
  'picked_up',
  'in_transit',
  'delivered',
  'cancelled',
  'failed'
);

CREATE TYPE order_action AS ENUM (
  'accept',
  'reject',
  'auto_reject',
  'timeout'
);

CREATE TYPE wallet_entry_type AS ENUM (
  'earning',
  'penalty',
  'onboarding_fee',
  'adjustment',
  'refund',
  'bonus',
  'referral_bonus'
);

CREATE TYPE withdrawal_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled'
);

-- REMOVED: payment_status_type enum
-- Moved to 0008_unified_order_schema.sql for enhanced version with more statuses
-- ('pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded', 'cancelled')

CREATE TYPE offer_scope AS ENUM (
  'global',
  'city',
  'rider'
);

CREATE TYPE reward_type AS ENUM (
  'cash',
  'voucher',
  'bonus'
);

CREATE TYPE rating_from_type AS ENUM (
  'customer',
  'merchant'
);

CREATE TYPE ticket_status AS ENUM (
  'open',
  'in_progress',
  'resolved',
  'closed'
);

-- ============================================================================
-- RIDER CORE DOMAIN
-- ============================================================================

CREATE TABLE riders (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  mobile TEXT NOT NULL UNIQUE,
  country_code TEXT NOT NULL DEFAULT '+91',
  name TEXT,
  aadhaar_number TEXT,
  pan_number TEXT,
  dob DATE,
  selfie_url TEXT,
  onboarding_stage onboarding_stage NOT NULL DEFAULT 'MOBILE_VERIFIED',
  kyc_status kyc_status NOT NULL DEFAULT 'PENDING',
  status rider_status NOT NULL DEFAULT 'INACTIVE',
  city TEXT,
  state TEXT,
  pincode TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  referral_code TEXT UNIQUE,
  referred_by INTEGER REFERENCES riders(id),
  default_language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX riders_mobile_idx ON riders(mobile);
CREATE UNIQUE INDEX riders_referral_code_idx ON riders(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX riders_status_idx ON riders(status);
CREATE INDEX riders_city_idx ON riders(city);
CREATE INDEX riders_kyc_status_idx ON riders(kyc_status);

-- Rider Documents
CREATE TABLE rider_documents (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  doc_type document_type NOT NULL,
  file_url TEXT NOT NULL,
  extracted_name TEXT,
  extracted_dob DATE,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  verifier_user_id INTEGER,
  rejected_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX rider_documents_rider_id_idx ON rider_documents(rider_id);
CREATE INDEX rider_documents_doc_type_idx ON rider_documents(doc_type);
CREATE INDEX rider_documents_verified_idx ON rider_documents(verified);

-- ============================================================================
-- DEVICE & SECURITY
-- ============================================================================

CREATE TABLE rider_devices (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  ip_address TEXT,
  sim_id TEXT,
  model TEXT,
  os_version TEXT,
  fcm_token TEXT,
  allowed BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX rider_devices_rider_id_idx ON rider_devices(rider_id);
CREATE INDEX rider_devices_device_id_idx ON rider_devices(device_id);
CREATE INDEX rider_devices_allowed_idx ON rider_devices(allowed);

-- Blacklist History
CREATE TABLE blacklist_history (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  banned BOOLEAN NOT NULL DEFAULT TRUE,
  admin_user_id INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX blacklist_history_rider_id_idx ON blacklist_history(rider_id);
CREATE INDEX blacklist_history_banned_idx ON blacklist_history(banned);

-- ============================================================================
-- DUTY & LOCATION TRACKING
-- ============================================================================

CREATE TABLE duty_logs (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  status duty_status NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX duty_logs_rider_id_idx ON duty_logs(rider_id);
CREATE INDEX duty_logs_timestamp_idx ON duty_logs(timestamp);
CREATE INDEX duty_logs_rider_status_idx ON duty_logs(rider_id, status);

-- Location Logs (Partition-ready)
-- Note: PRIMARY KEY must include partition column (created_at) for partitioned tables
CREATE TABLE location_logs (
  id BIGSERIAL,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  battery_percent INTEGER,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX location_logs_rider_id_idx ON location_logs(rider_id);
CREATE INDEX location_logs_created_at_idx ON location_logs(created_at);
CREATE INDEX location_logs_rider_created_idx ON location_logs(rider_id, created_at);

-- Create initial partition for current month
CREATE TABLE location_logs_y2025m01 PARTITION OF location_logs
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- ============================================================================
-- ORDERS & ORDER EVENTS
-- ============================================================================

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  order_type order_type NOT NULL,
  external_ref TEXT,
  rider_id INTEGER REFERENCES riders(id),
  merchant_id INTEGER,
  customer_id INTEGER,
  pickup_address TEXT NOT NULL,
  drop_address TEXT NOT NULL,
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lon DOUBLE PRECISION NOT NULL,
  drop_lat DOUBLE PRECISION NOT NULL,
  drop_lon DOUBLE PRECISION NOT NULL,
  distance_km NUMERIC(10, 2),
  eta_seconds INTEGER,
  fare_amount NUMERIC(10, 2),
  commission_amount NUMERIC(10, 2),
  rider_earning NUMERIC(10, 2),
  status order_status_type NOT NULL DEFAULT 'assigned',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX orders_rider_id_idx ON orders(rider_id);
CREATE INDEX orders_status_idx ON orders(status);
CREATE INDEX orders_order_type_idx ON orders(order_type);
CREATE INDEX orders_created_at_idx ON orders(created_at);
CREATE INDEX orders_rider_status_idx ON orders(rider_id, status);
CREATE INDEX orders_external_ref_idx ON orders(external_ref) WHERE external_ref IS NOT NULL;

-- Order Actions
CREATE TABLE order_actions (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  action order_action NOT NULL,
  reason TEXT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX order_actions_order_id_idx ON order_actions(order_id);
CREATE INDEX order_actions_rider_id_idx ON order_actions(rider_id);
CREATE INDEX order_actions_timestamp_idx ON order_actions(timestamp);

-- Order Events
CREATE TABLE order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  actor_type TEXT,
  actor_id INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX order_events_order_id_idx ON order_events(order_id);
CREATE INDEX order_events_event_idx ON order_events(event);
CREATE INDEX order_events_created_at_idx ON order_events(created_at);
CREATE INDEX order_events_order_event_idx ON order_events(order_id, event);

-- ============================================================================
-- WALLET, LEDGER & PAYMENTS
-- ============================================================================

-- Wallet Ledger (Partitioned by HASH)
-- Note: PRIMARY KEY must include partition column (rider_id) for partitioned tables
CREATE TABLE wallet_ledger (
  id BIGSERIAL,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  entry_type wallet_entry_type NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  balance NUMERIC(10, 2),
  ref TEXT,
  ref_type TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, rider_id)
) PARTITION BY HASH (rider_id);

CREATE INDEX wallet_ledger_rider_id_idx ON wallet_ledger(rider_id);
CREATE INDEX wallet_ledger_entry_type_idx ON wallet_ledger(entry_type);
CREATE INDEX wallet_ledger_created_at_idx ON wallet_ledger(created_at);
CREATE INDEX wallet_ledger_rider_created_idx ON wallet_ledger(rider_id, created_at);
CREATE INDEX wallet_ledger_ref_idx ON wallet_ledger(ref) WHERE ref IS NOT NULL;

-- Create initial partitions for wallet_ledger (4 partitions)
CREATE TABLE wallet_ledger_0 PARTITION OF wallet_ledger FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE wallet_ledger_1 PARTITION OF wallet_ledger FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE wallet_ledger_2 PARTITION OF wallet_ledger FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE wallet_ledger_3 PARTITION OF wallet_ledger FOR VALUES WITH (MODULUS 4, REMAINDER 3);

-- Withdrawal Requests
CREATE TABLE withdrawal_requests (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  status withdrawal_status NOT NULL DEFAULT 'pending',
  bank_acc TEXT NOT NULL,
  ifsc TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  upi_id TEXT,
  transaction_id TEXT,
  failure_reason TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX withdrawal_requests_rider_id_idx ON withdrawal_requests(rider_id);
CREATE INDEX withdrawal_requests_status_idx ON withdrawal_requests(status);
CREATE INDEX withdrawal_requests_created_at_idx ON withdrawal_requests(created_at);

-- Onboarding Payments
CREATE TABLE onboarding_payments (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  provider TEXT NOT NULL,
  ref_id TEXT NOT NULL UNIQUE,
  payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX onboarding_payments_rider_id_idx ON onboarding_payments(rider_id);
CREATE UNIQUE INDEX onboarding_payments_ref_id_idx ON onboarding_payments(ref_id);
CREATE INDEX onboarding_payments_status_idx ON onboarding_payments(status);

-- ============================================================================
-- OFFERS & PARTICIPATION
-- ============================================================================

CREATE TABLE offers (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  scope offer_scope NOT NULL DEFAULT 'global',
  condition JSONB NOT NULL,
  reward_type reward_type NOT NULL DEFAULT 'cash',
  reward_amount NUMERIC(10, 2),
  reward_metadata JSONB DEFAULT '{}',
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX offers_scope_idx ON offers(scope);
CREATE INDEX offers_active_idx ON offers(active);
CREATE INDEX offers_dates_idx ON offers(start_date, end_date);

-- Offer Participation
CREATE TABLE offer_participation (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  progress JSONB DEFAULT '{}',
  reward_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  reward_claimed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(rider_id, offer_id)
);

CREATE INDEX offer_participation_rider_id_idx ON offer_participation(rider_id);
CREATE INDEX offer_participation_offer_id_idx ON offer_participation(offer_id);
CREATE INDEX offer_participation_completed_idx ON offer_participation(completed);
CREATE UNIQUE INDEX offer_participation_rider_offer_idx ON offer_participation(rider_id, offer_id);

-- ============================================================================
-- RATINGS & REVIEWS
-- ============================================================================

CREATE TABLE ratings (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES orders(id),
  from_type rating_from_type NOT NULL,
  from_id INTEGER,
  rating SMALLINT NOT NULL,
  comment TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX ratings_rider_id_idx ON ratings(rider_id);
CREATE INDEX ratings_order_id_idx ON ratings(order_id);
CREATE INDEX ratings_from_type_idx ON ratings(from_type);
CREATE INDEX ratings_created_at_idx ON ratings(created_at);

-- ============================================================================
-- TICKETS & COMPLAINTS
-- ============================================================================

CREATE TABLE tickets (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES orders(id),
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status ticket_status NOT NULL DEFAULT 'open',
  assigned_to INTEGER,
  resolution TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX tickets_rider_id_idx ON tickets(rider_id);
CREATE INDEX tickets_status_idx ON tickets(status);
CREATE INDEX tickets_category_idx ON tickets(category);
CREATE INDEX tickets_created_at_idx ON tickets(created_at);

-- ============================================================================
-- REFERRAL SYSTEM
-- ============================================================================

CREATE TABLE referrals (
  id BIGSERIAL PRIMARY KEY,
  referrer_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  referred_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  referrer_reward NUMERIC(10, 2),
  referred_reward NUMERIC(10, 2),
  referrer_reward_paid BOOLEAN NOT NULL DEFAULT FALSE,
  referred_reward_paid BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(referred_id)
);

CREATE INDEX referrals_referrer_id_idx ON referrals(referrer_id);
CREATE INDEX referrals_referred_id_idx ON referrals(referred_id);
CREATE UNIQUE INDEX referrals_referred_id_unique_idx ON referrals(referred_id);

-- ============================================================================
-- ANALYTICS & AGGREGATES
-- ============================================================================

CREATE TABLE rider_daily_analytics (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_orders INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  cancelled INTEGER NOT NULL DEFAULT 0,
  acceptance_rate NUMERIC(5, 2),
  earnings_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  penalties_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  duty_hours NUMERIC(5, 2),
  avg_rating NUMERIC(3, 2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(rider_id, date)
);

CREATE INDEX rider_daily_analytics_rider_id_idx ON rider_daily_analytics(rider_id);
CREATE INDEX rider_daily_analytics_date_idx ON rider_daily_analytics(date);
CREATE UNIQUE INDEX rider_daily_analytics_rider_date_idx ON rider_daily_analytics(rider_id, date);

-- ============================================================================
-- FRAUD & SECURITY LOGS
-- ============================================================================

CREATE TABLE fraud_logs (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER REFERENCES riders(id) ON DELETE SET NULL,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  fraud_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  description TEXT NOT NULL,
  evidence JSONB DEFAULT '{}',
  action_taken TEXT,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX fraud_logs_rider_id_idx ON fraud_logs(rider_id);
CREATE INDEX fraud_logs_fraud_type_idx ON fraud_logs(fraud_type);
CREATE INDEX fraud_logs_severity_idx ON fraud_logs(severity);
CREATE INDEX fraud_logs_resolved_idx ON fraud_logs(resolved);
CREATE INDEX fraud_logs_created_at_idx ON fraud_logs(created_at);

-- ============================================================================
-- ADMIN & ACTION LOGS
-- ============================================================================

CREATE TABLE admin_action_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX admin_action_logs_admin_user_id_idx ON admin_action_logs(admin_user_id);
CREATE INDEX admin_action_logs_entity_type_idx ON admin_action_logs(entity_type);
CREATE INDEX admin_action_logs_action_idx ON admin_action_logs(action);
CREATE INDEX admin_action_logs_created_at_idx ON admin_action_logs(created_at);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for riders table
CREATE TRIGGER update_riders_updated_at
  BEFORE UPDATE ON riders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for orders table
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for withdrawal_requests table
CREATE TRIGGER update_withdrawal_requests_updated_at
  BEFORE UPDATE ON withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for onboarding_payments table
CREATE TRIGGER update_onboarding_payments_updated_at
  BEFORE UPDATE ON onboarding_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for offers table
CREATE TRIGGER update_offers_updated_at
  BEFORE UPDATE ON offers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for offer_participation table
CREATE TRIGGER update_offer_participation_updated_at
  BEFORE UPDATE ON offer_participation
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for tickets table
CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MATERIALIZED VIEWS FOR ANALYTICS
-- ============================================================================

-- Rider Leaderboard (Top Earners)
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

CREATE UNIQUE INDEX rider_leaderboard_rider_id_idx ON rider_leaderboard(rider_id);
CREATE INDEX rider_leaderboard_earnings_idx ON rider_leaderboard(total_earnings DESC);

-- Rider Performance Summary
CREATE MATERIALIZED VIEW rider_performance_summary AS
SELECT 
  r.id AS rider_id,
  r.name,
  r.city,
  COUNT(DISTINCT o.id) AS total_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered') AS completed_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'cancelled') AS cancelled_orders,
  COUNT(DISTINCT oa.id) FILTER (WHERE oa.action = 'accept') AS accepted_orders,
  COUNT(DISTINCT oa.id) FILTER (WHERE oa.action = 'reject') AS rejected_orders,
  CASE 
    WHEN COUNT(DISTINCT oa.id) > 0 
    THEN (COUNT(DISTINCT oa.id) FILTER (WHERE oa.action = 'accept')::NUMERIC / COUNT(DISTINCT oa.id)::NUMERIC * 100)
    ELSE 0 
  END AS acceptance_rate,
  COALESCE(AVG(rt.rating), 0) AS avg_rating,
  COALESCE(SUM(wl.amount) FILTER (WHERE wl.entry_type = 'earning'), 0) AS total_earnings
FROM riders r
LEFT JOIN orders o ON r.id = o.rider_id
LEFT JOIN order_actions oa ON o.id = oa.order_id AND o.rider_id = oa.rider_id
LEFT JOIN ratings rt ON r.id = rt.rider_id
LEFT JOIN wallet_ledger wl ON r.id = wl.rider_id
WHERE r.status = 'ACTIVE'
GROUP BY r.id, r.name, r.city;

CREATE UNIQUE INDEX rider_performance_summary_rider_id_idx ON rider_performance_summary(rider_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_participation ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_daily_analytics ENABLE ROW LEVEL SECURITY;

-- Example RLS Policy: Riders can only see their own data
-- Note: Adjust these policies based on your authentication system
-- This assumes you have a function auth.uid() that returns the rider_id

-- CREATE POLICY "Riders can view own data" ON riders
--   FOR SELECT USING (id = (SELECT rider_id FROM auth.users WHERE id = auth.uid()));

-- CREATE POLICY "Riders can update own data" ON riders
--   FOR UPDATE USING (id = (SELECT rider_id FROM auth.users WHERE id = auth.uid()));

-- Similar policies should be created for other tables
-- Admin users should have separate policies with elevated privileges
