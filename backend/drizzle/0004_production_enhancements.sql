-- Production Enhancements Migration
-- Adds critical production-ready tables
-- Migration: 0004_production_enhancements
-- Database: Supabase PostgreSQL

-- ============================================================================
-- PRIORITY 1: CRITICAL FOR LAUNCH
-- ============================================================================

-- ============================================================================
-- 1. OTP VERIFICATION LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS otp_verification_logs (
  id BIGSERIAL PRIMARY KEY,
  phone_e164 TEXT NOT NULL,
  otp_hash TEXT NOT NULL, -- Hashed OTP, never store plain text
  status TEXT NOT NULL, -- 'sent', 'verified', 'expired', 'failed', 'blocked'
  provider TEXT NOT NULL, -- 'MSG91', 'FIREBASE', 'TWILIO', etc.
  attempts_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  ip_address TEXT,
  user_agent TEXT,
  device_id TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS otp_verification_logs_phone_idx ON otp_verification_logs(phone_e164);
CREATE INDEX IF NOT EXISTS otp_verification_logs_status_idx ON otp_verification_logs(status);
CREATE INDEX IF NOT EXISTS otp_verification_logs_created_at_idx ON otp_verification_logs(created_at);
CREATE INDEX IF NOT EXISTS otp_verification_logs_device_id_idx ON otp_verification_logs(device_id) WHERE device_id IS NOT NULL;

-- ============================================================================
-- 2. PAYMENT WEBHOOKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_webhooks (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL, -- 'razorpay', 'stripe', 'payu', etc.
  webhook_id TEXT, -- Provider's webhook ID
  event_type TEXT NOT NULL, -- 'payment.success', 'payment.failed', etc.
  payload JSONB NOT NULL, -- Full webhook payload
  signature TEXT, -- Provider signature for verification
  signature_verified BOOLEAN DEFAULT FALSE,
  processing_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'processed', 'failed', 'ignored'
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_webhooks_provider_idx ON payment_webhooks(provider);
CREATE INDEX IF NOT EXISTS payment_webhooks_event_type_idx ON payment_webhooks(event_type);
CREATE INDEX IF NOT EXISTS payment_webhooks_processing_status_idx ON payment_webhooks(processing_status);
CREATE INDEX IF NOT EXISTS payment_webhooks_webhook_id_idx ON payment_webhooks(webhook_id) WHERE webhook_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_webhooks_created_at_idx ON payment_webhooks(created_at);

-- ============================================================================
-- 3. ORDER CANCELLATION REASONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_cancellation_reasons (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  cancelled_by TEXT NOT NULL, -- 'rider', 'customer', 'merchant', 'system'
  cancelled_by_id INTEGER, -- Rider ID, customer ID, or merchant ID
  reason_code TEXT NOT NULL, -- 'rider_unavailable', 'customer_request', 'merchant_closed', etc.
  reason_text TEXT,
  refund_status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'rejected'
  refund_amount NUMERIC(10, 2),
  penalty_applied BOOLEAN DEFAULT FALSE,
  penalty_amount NUMERIC(10, 2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_cancellation_reasons_order_id_idx ON order_cancellation_reasons(order_id);
CREATE INDEX IF NOT EXISTS order_cancellation_reasons_cancelled_by_idx ON order_cancellation_reasons(cancelled_by);
CREATE INDEX IF NOT EXISTS order_cancellation_reasons_reason_code_idx ON order_cancellation_reasons(reason_code);
CREATE INDEX IF NOT EXISTS order_cancellation_reasons_refund_status_idx ON order_cancellation_reasons(refund_status);

-- Add foreign key to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason_id BIGINT REFERENCES order_cancellation_reasons(id);

-- ============================================================================
-- 4. NOTIFICATION PREFERENCES
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL, -- 'order', 'payment', 'offer', 'system', 'promotional'
  channel TEXT NOT NULL, -- 'push', 'sms', 'email'
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_start TIME, -- e.g., '22:00:00'
  quiet_hours_end TIME, -- e.g., '08:00:00'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(rider_id, notification_type, channel)
);

CREATE INDEX IF NOT EXISTS notification_preferences_rider_id_idx ON notification_preferences(rider_id);
CREATE INDEX IF NOT EXISTS notification_preferences_notification_type_idx ON notification_preferences(notification_type);
CREATE INDEX IF NOT EXISTS notification_preferences_enabled_idx ON notification_preferences(enabled);

-- ============================================================================
-- 5. SYSTEM CONFIG
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_config (
  id BIGSERIAL PRIMARY KEY,
  config_key TEXT NOT NULL UNIQUE, -- e.g., 'min_withdrawal_amount', 'max_order_distance_km'
  config_value JSONB NOT NULL, -- Can be string, number, boolean, or complex object
  value_type TEXT NOT NULL, -- 'string', 'number', 'boolean', 'json'
  description TEXT,
  category TEXT, -- 'payment', 'order', 'rider', 'system', etc.
  updated_by INTEGER, -- Admin user ID
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS system_config_category_idx ON system_config(category);
CREATE INDEX IF NOT EXISTS system_config_updated_at_idx ON system_config(updated_at);

-- Insert default config values
INSERT INTO system_config (config_key, config_value, value_type, description, category) VALUES
  ('min_withdrawal_amount', '100', 'number', 'Minimum withdrawal amount in INR', 'payment'),
  ('max_withdrawal_amount', '50000', 'number', 'Maximum withdrawal amount per request in INR', 'payment'),
  ('max_order_distance_km', '50', 'number', 'Maximum order distance in kilometers', 'order'),
  ('order_acceptance_timeout_seconds', '30', 'number', 'Time in seconds for rider to accept order', 'order'),
  ('rider_rating_threshold', '4.0', 'number', 'Minimum rating required for active riders', 'rider'),
  ('onboarding_fee_amount', '500', 'number', 'Onboarding fee in INR', 'payment'),
  ('commission_percentage', '15', 'number', 'Default commission percentage', 'payment'),
  ('support_email', '"support@gatimitra.com"', 'string', 'Support email address', 'system'),
  ('support_phone', '"+911234567890"', 'string', 'Support phone number', 'system')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- 6. APP VERSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_versions (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL, -- 'android', 'ios'
  version_code INTEGER NOT NULL, -- Numeric version code (e.g., 1, 2, 3)
  version_name TEXT NOT NULL, -- Human-readable version (e.g., '1.0.0', '1.0.1')
  force_update_required BOOLEAN DEFAULT FALSE,
  min_supported_version_code INTEGER, -- Minimum version that can still use the app
  release_notes TEXT,
  release_notes_i18n JSONB DEFAULT '{}', -- Multi-language release notes
  download_url TEXT, -- App store or direct download URL
  active BOOLEAN DEFAULT TRUE,
  released_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(platform, version_code)
);

CREATE INDEX IF NOT EXISTS app_versions_platform_idx ON app_versions(platform);
CREATE INDEX IF NOT EXISTS app_versions_active_idx ON app_versions(active);
CREATE INDEX IF NOT EXISTS app_versions_version_code_idx ON app_versions(platform, version_code DESC);

-- ============================================================================
-- PRIORITY 2: IMPORTANT FOR OPERATIONS
-- ============================================================================

-- ============================================================================
-- 7. RIDER VEHICLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS rider_vehicles (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  vehicle_type TEXT NOT NULL, -- 'bike', 'car', 'bicycle', 'scooter', 'auto'
  registration_number TEXT NOT NULL,
  make TEXT, -- e.g., 'Honda', 'Hero'
  model TEXT, -- e.g., 'Activa', 'Splendor'
  year INTEGER,
  color TEXT,
  insurance_expiry DATE,
  rc_document_url TEXT,
  insurance_document_url TEXT,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP WITH TIME ZONE,
  verified_by INTEGER, -- Admin user ID
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rider_vehicles_rider_id_idx ON rider_vehicles(rider_id);
CREATE INDEX IF NOT EXISTS rider_vehicles_vehicle_type_idx ON rider_vehicles(vehicle_type);
CREATE INDEX IF NOT EXISTS rider_vehicles_registration_number_idx ON rider_vehicles(registration_number);
CREATE INDEX IF NOT EXISTS rider_vehicles_verified_idx ON rider_vehicles(verified);
CREATE INDEX IF NOT EXISTS rider_vehicles_is_active_idx ON rider_vehicles(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS rider_vehicles_rider_active_idx ON rider_vehicles(rider_id) WHERE is_active = TRUE;

-- ============================================================================
-- 8. INSURANCE POLICIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS insurance_policies (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  vehicle_id BIGINT REFERENCES rider_vehicles(id) ON DELETE SET NULL,
  policy_number TEXT NOT NULL,
  provider TEXT NOT NULL, -- Insurance company name
  coverage_amount NUMERIC(10, 2),
  premium_amount NUMERIC(10, 2),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'expired', 'pending', 'cancelled'
  renewal_reminder_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS insurance_policies_rider_id_idx ON insurance_policies(rider_id);
CREATE INDEX IF NOT EXISTS insurance_policies_vehicle_id_idx ON insurance_policies(vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS insurance_policies_status_idx ON insurance_policies(status);
CREATE INDEX IF NOT EXISTS insurance_policies_end_date_idx ON insurance_policies(end_date);
-- Note: Cannot use CURRENT_DATE in index predicate (not IMMUTABLE)
-- Application should filter by date when querying active policies
CREATE INDEX IF NOT EXISTS insurance_policies_active_end_date_idx ON insurance_policies(end_date) WHERE status = 'active';

-- ============================================================================
-- 9. SETTLEMENT BATCHES
-- ============================================================================

CREATE TABLE IF NOT EXISTS settlement_batches (
  id BIGSERIAL PRIMARY KEY,
  batch_number TEXT NOT NULL UNIQUE, -- Human-readable batch number
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL,
  total_riders INTEGER NOT NULL DEFAULT 0,
  processing_fee_total NUMERIC(10, 2) DEFAULT 0,
  tds_total NUMERIC(10, 2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'cancelled'
  settlement_file_url TEXT, -- CSV/Excel file with settlement details
  initiated_by INTEGER, -- Admin user ID
  processed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS settlement_batches_status_idx ON settlement_batches(status);
CREATE INDEX IF NOT EXISTS settlement_batches_date_range_idx ON settlement_batches(date_range_start, date_range_end);
CREATE INDEX IF NOT EXISTS settlement_batches_created_at_idx ON settlement_batches(created_at);

-- Add foreign key to withdrawal_requests
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS settlement_batch_id BIGINT REFERENCES settlement_batches(id);

CREATE INDEX IF NOT EXISTS withdrawal_requests_settlement_batch_id_idx ON withdrawal_requests(settlement_batch_id) WHERE settlement_batch_id IS NOT NULL;

-- ============================================================================
-- 10. COMMISSION HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS commission_history (
  id BIGSERIAL PRIMARY KEY,
  order_type order_type NOT NULL,
  commission_percentage NUMERIC(5, 2), -- e.g., 15.00 for 15%
  commission_fixed_amount NUMERIC(10, 2), -- Fixed commission amount
  commission_type TEXT NOT NULL DEFAULT 'percentage', -- 'percentage', 'fixed', 'hybrid'
  city TEXT, -- NULL means global, otherwise city-specific
  zone TEXT, -- Optional zone within city
  effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
  effective_to TIMESTAMP WITH TIME ZONE, -- NULL means currently active
  created_by INTEGER, -- Admin user ID
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS commission_history_order_type_idx ON commission_history(order_type);
CREATE INDEX IF NOT EXISTS commission_history_city_idx ON commission_history(city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_history_effective_from_idx ON commission_history(effective_from);
CREATE INDEX IF NOT EXISTS commission_history_active_idx ON commission_history(effective_from, effective_to) WHERE effective_to IS NULL;

-- ============================================================================
-- 11. NOTIFICATION LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_logs (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  template_id TEXT, -- Reference to notification template (if using templates)
  notification_type TEXT NOT NULL, -- 'order', 'payment', 'offer', etc.
  channel TEXT NOT NULL, -- 'push', 'sms', 'email'
  title TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed', 'bounced'
  provider TEXT, -- 'FCM', 'MSG91', 'SendGrid', etc.
  provider_message_id TEXT, -- Provider's message ID
  provider_response JSONB, -- Full provider response
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  opened_at TIMESTAMP WITH TIME ZONE, -- For emails
  clicked_at TIMESTAMP WITH TIME ZONE, -- For emails/SMS with links
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_logs_rider_id_idx ON notification_logs(rider_id);
CREATE INDEX IF NOT EXISTS notification_logs_notification_type_idx ON notification_logs(notification_type);
CREATE INDEX IF NOT EXISTS notification_logs_channel_idx ON notification_logs(channel);
CREATE INDEX IF NOT EXISTS notification_logs_status_idx ON notification_logs(status);
CREATE INDEX IF NOT EXISTS notification_logs_created_at_idx ON notification_logs(created_at);
CREATE INDEX IF NOT EXISTS notification_logs_provider_message_id_idx ON notification_logs(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- ============================================================================
-- 12. API RATE LIMITS
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_rate_limits (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER REFERENCES riders(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL, -- e.g., '/api/orders/accept', '/api/location/ping'
  ip_address TEXT,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  window_end TIMESTAMP WITH TIME ZONE NOT NULL,
  limit_exceeded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_rate_limits_rider_id_idx ON api_rate_limits(rider_id) WHERE rider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS api_rate_limits_ip_address_idx ON api_rate_limits(ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS api_rate_limits_endpoint_idx ON api_rate_limits(endpoint);
CREATE INDEX IF NOT EXISTS api_rate_limits_window_end_idx ON api_rate_limits(window_end);

-- Partial unique indexes (with WHERE clauses)
CREATE UNIQUE INDEX IF NOT EXISTS api_rate_limits_rider_unique_idx ON api_rate_limits(rider_id, endpoint, window_start) WHERE rider_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS api_rate_limits_ip_unique_idx ON api_rate_limits(ip_address, endpoint, window_start) WHERE ip_address IS NOT NULL;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger for notification_preferences updated_at
DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for system_config updated_at
DROP TRIGGER IF EXISTS update_system_config_updated_at ON system_config;
CREATE TRIGGER update_system_config_updated_at
  BEFORE UPDATE ON system_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for rider_vehicles updated_at
DROP TRIGGER IF EXISTS update_rider_vehicles_updated_at ON rider_vehicles;
CREATE TRIGGER update_rider_vehicles_updated_at
  BEFORE UPDATE ON rider_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for insurance_policies updated_at
DROP TRIGGER IF EXISTS update_insurance_policies_updated_at ON insurance_policies;
CREATE TRIGGER update_insurance_policies_updated_at
  BEFORE UPDATE ON insurance_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for settlement_batches updated_at
DROP TRIGGER IF EXISTS update_settlement_batches_updated_at ON settlement_batches;
CREATE TRIGGER update_settlement_batches_updated_at
  BEFORE UPDATE ON settlement_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE otp_verification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_cancellation_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE otp_verification_logs IS 'Audit trail for OTP/SMS verification. Critical for security and compliance.';
COMMENT ON TABLE payment_webhooks IS 'Webhook logs from payment gateways. Essential for payment reconciliation.';
COMMENT ON TABLE order_cancellation_reasons IS 'Tracks order cancellations with reasons and refund/penalty information.';
COMMENT ON TABLE notification_preferences IS 'User preferences for notifications. Allows granular control per notification type and channel.';
COMMENT ON TABLE system_config IS 'Dynamic system configuration. Allows runtime changes without code deployment.';
COMMENT ON TABLE app_versions IS 'App version management. Tracks versions and enforces updates.';
COMMENT ON TABLE rider_vehicles IS 'Vehicle information for riders. Supports multiple vehicles per rider.';
COMMENT ON TABLE insurance_policies IS 'Insurance policy tracking. Monitors expiry and sends renewal reminders.';
COMMENT ON TABLE settlement_batches IS 'Bulk withdrawal processing. Groups multiple withdrawals for batch processing.';
COMMENT ON TABLE commission_history IS 'Historical commission structure. Tracks changes over time for audit.';
COMMENT ON TABLE notification_logs IS 'Notification delivery tracking. Monitors delivery status and engagement.';
COMMENT ON TABLE api_rate_limits IS 'API rate limiting tracking. Prevents abuse and ensures fair usage.';
