-- ============================================================================
-- CUSTOMER DOMAIN SCHEMA - Production Grade
-- GatiMitra Multi-Service Platform
-- Migration: 0013_customer_domain_complete
-- Database: Supabase PostgreSQL
-- 
-- SERVICES: Food Delivery, Parcel Delivery, Ride Booking
-- FEATURES: Profile, Auth, Wallet, Loyalty, Support, Fraud Detection
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_status') THEN
    CREATE TYPE customer_status AS ENUM ('ACTIVE', 'SUSPENDED', 'BLOCKED', 'DEACTIVATED', 'PENDING_VERIFICATION');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_gender') THEN
    CREATE TYPE customer_gender AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_level') THEN
    CREATE TYPE risk_level AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loyalty_tier') THEN
    CREATE TYPE loyalty_tier AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'address_type') THEN
    CREATE TYPE address_type AS ENUM ('HOME', 'WORK', 'HOTEL', 'OTHER');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_platform') THEN
    CREATE TYPE device_platform AS ENUM ('ANDROID', 'IOS', 'WEB', 'OTHER');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_type') THEN
    CREATE TYPE payment_method_type AS ENUM ('CARD', 'UPI', 'NETBANKING', 'WALLET', 'COD', 'PAY_LATER');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_transaction_type') THEN
    CREATE TYPE wallet_transaction_type AS ENUM ('CREDIT', 'DEBIT', 'REFUND', 'BONUS', 'CASHBACK', 'REVERSAL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'coupon_status') THEN
    CREATE TYPE coupon_status AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'DISABLED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status_customer') THEN
    CREATE TYPE ticket_status_customer AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED', 'ESCALATED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_type') THEN
    CREATE TYPE verification_type AS ENUM ('MOBILE', 'EMAIL', 'IDENTITY', 'ADDRESS');
  END IF;
END $$;

-- ============================================================================
-- PHASE 1: CORE CUSTOMER STRUCTURE
-- ============================================================================

-- Customers (Core Profile)
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE,
  
  -- Personal Details
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT UNIQUE,
  email_verified BOOLEAN DEFAULT FALSE,
  
  -- Mobile
  primary_mobile TEXT NOT NULL UNIQUE,
  primary_mobile_normalized TEXT,
  primary_mobile_country_code TEXT DEFAULT '+91',
  mobile_verified BOOLEAN DEFAULT TRUE,
  
  -- Additional Contact
  alternate_mobile TEXT,
  whatsapp_number TEXT,
  
  -- Profile
  gender customer_gender,
  date_of_birth DATE,
  profile_image_url TEXT,
  bio TEXT,
  
  -- Language
  preferred_language TEXT DEFAULT 'en',
  
  -- Referral
  referral_code TEXT UNIQUE,
  referred_by TEXT, -- Another customer's referral_code
  referrer_customer_id BIGINT REFERENCES customers(id),
  
  -- Account Status
  account_status customer_status NOT NULL DEFAULT 'ACTIVE',
  status_reason TEXT,
  
  -- Risk & Trust
  risk_flag risk_level DEFAULT 'LOW',
  trust_score NUMERIC(5, 2) DEFAULT 100.0,
  fraud_score NUMERIC(5, 2) DEFAULT 0.0,
  
  -- Wallet
  wallet_balance NUMERIC(12, 2) DEFAULT 0.0,
  wallet_locked_amount NUMERIC(12, 2) DEFAULT 0.0,
  
  -- Verification
  is_identity_verified BOOLEAN DEFAULT FALSE,
  is_email_verified BOOLEAN DEFAULT FALSE,
  is_mobile_verified BOOLEAN DEFAULT TRUE,
  
  -- Activity
  last_login_at TIMESTAMP WITH TIME ZONE,
  last_order_at TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE,
  
  -- Soft Delete
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by INTEGER,
  deletion_reason TEXT,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_via TEXT DEFAULT 'app', -- 'app', 'web', 'admin'
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS customers_customer_id_idx ON customers(customer_id);
CREATE INDEX IF NOT EXISTS customers_primary_mobile_idx ON customers(primary_mobile);
CREATE INDEX IF NOT EXISTS customers_email_idx ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_referral_code_idx ON customers(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_account_status_idx ON customers(account_status);
CREATE INDEX IF NOT EXISTS customers_risk_flag_idx ON customers(risk_flag);
CREATE INDEX IF NOT EXISTS customers_is_active_idx ON customers(account_status) WHERE account_status = 'ACTIVE' AND deleted_at IS NULL;

-- Customer Auth (Sensitive Data Separated)
CREATE TABLE IF NOT EXISTS customer_auth (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Auth Details
  auth_provider TEXT DEFAULT 'phone', -- 'phone', 'email', 'google', 'facebook'
  auth_uid TEXT, -- Provider's user ID
  
  -- OTP
  last_otp TEXT, -- Encrypted
  last_otp_sent_at TIMESTAMP WITH TIME ZONE,
  otp_attempts INTEGER DEFAULT 0,
  otp_locked_until TIMESTAMP WITH TIME ZONE,
  
  -- Password (if applicable)
  password_hash TEXT,
  password_salt TEXT,
  password_last_changed_at TIMESTAMP WITH TIME ZONE,
  
  -- Security
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  two_factor_secret TEXT,
  
  -- Account Recovery
  recovery_email TEXT,
  recovery_mobile TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(customer_id)
);

CREATE INDEX IF NOT EXISTS customer_auth_customer_id_idx ON customer_auth(customer_id);

-- Customer Devices (with History)
CREATE TABLE IF NOT EXISTS customer_devices (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Device Identity
  device_id TEXT NOT NULL,
  device_fingerprint TEXT,
  
  -- Device Details
  device_type device_platform NOT NULL,
  device_os TEXT,
  device_os_version TEXT,
  device_model TEXT,
  device_brand TEXT,
  
  -- App Details
  app_version TEXT,
  app_build_number TEXT,
  
  -- Network
  ip_address TEXT,
  ip_location TEXT,
  network_type TEXT, -- 'WIFI', '4G', '5G'
  
  -- Push Notifications
  fcm_token TEXT,
  apns_token TEXT,
  push_enabled BOOLEAN DEFAULT TRUE,
  
  -- Status
  is_primary BOOLEAN DEFAULT FALSE,
  is_trusted BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Activity
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_ip TEXT,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_devices_customer_id_idx ON customer_devices(customer_id);
CREATE INDEX IF NOT EXISTS customer_devices_device_id_idx ON customer_devices(device_id);
CREATE INDEX IF NOT EXISTS customer_devices_is_primary_idx ON customer_devices(is_primary) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS customer_devices_is_active_idx ON customer_devices(is_active) WHERE is_active = TRUE;

-- Customer Sessions
CREATE TABLE IF NOT EXISTS customer_sessions (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  device_id BIGINT REFERENCES customer_devices(id) ON DELETE SET NULL,
  
  -- Session Details
  session_token TEXT NOT NULL UNIQUE,
  refresh_token TEXT,
  
  -- Session Metadata
  ip_address TEXT,
  user_agent TEXT,
  location_lat NUMERIC(10, 8),
  location_lon NUMERIC(11, 8),
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  logged_out_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS customer_sessions_customer_id_idx ON customer_sessions(customer_id);
CREATE INDEX IF NOT EXISTS customer_sessions_session_token_idx ON customer_sessions(session_token);
CREATE INDEX IF NOT EXISTS customer_sessions_is_active_idx ON customer_sessions(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS customer_sessions_expires_at_idx ON customer_sessions(expires_at);

-- Customer Profile History (Versioning)
CREATE TABLE IF NOT EXISTS customer_profiles_history (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Changed Fields
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  
  -- Change Details
  change_reason TEXT,
  changed_by TEXT NOT NULL, -- 'CUSTOMER', 'ADMIN', 'SYSTEM'
  changed_by_id INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_profiles_history_customer_id_idx ON customer_profiles_history(customer_id);
CREATE INDEX IF NOT EXISTS customer_profiles_history_field_name_idx ON customer_profiles_history(field_name);
CREATE INDEX IF NOT EXISTS customer_profiles_history_created_at_idx ON customer_profiles_history(created_at);

-- ============================================================================
-- PHASE 2: ADDRESSES & CONTACTS
-- ============================================================================

-- Customer Addresses
CREATE TABLE IF NOT EXISTS customer_addresses (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  address_id TEXT NOT NULL UNIQUE,
  
  -- Address Label
  label address_type NOT NULL DEFAULT 'HOME',
  custom_label TEXT,
  
  -- Address Details
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  address_auto TEXT, -- Google Maps formatted
  address_manual TEXT, -- User typed
  landmark TEXT,
  
  -- Location
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT DEFAULT 'IN',
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  
  -- Address Type
  is_delivery_address BOOLEAN DEFAULT TRUE,
  is_pickup_address BOOLEAN DEFAULT FALSE,
  
  -- Contact
  contact_name TEXT,
  contact_mobile TEXT,
  
  -- Delivery Instructions
  delivery_instructions TEXT,
  access_code TEXT,
  floor_number TEXT,
  
  -- Status
  is_default BOOLEAN DEFAULT FALSE,
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Usage Stats
  order_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS customer_addresses_customer_id_idx ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS customer_addresses_address_id_idx ON customer_addresses(address_id);
CREATE INDEX IF NOT EXISTS customer_addresses_postal_code_idx ON customer_addresses(postal_code);
CREATE INDEX IF NOT EXISTS customer_addresses_is_default_idx ON customer_addresses(is_default) WHERE is_default = TRUE;
CREATE INDEX IF NOT EXISTS customer_addresses_is_active_idx ON customer_addresses(is_active) WHERE is_active = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS customer_addresses_location_idx ON customer_addresses(latitude, longitude) WHERE latitude IS NOT NULL;

-- Customer Address History (Versioning)
CREATE TABLE IF NOT EXISTS customer_address_history (
  id BIGSERIAL PRIMARY KEY,
  address_id BIGINT NOT NULL REFERENCES customer_addresses(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Snapshot
  address_snapshot JSONB NOT NULL,
  
  -- Change Details
  change_type TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE'
  changed_fields TEXT[],
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_address_history_address_id_idx ON customer_address_history(address_id);
CREATE INDEX IF NOT EXISTS customer_address_history_customer_id_idx ON customer_address_history(customer_id);

-- Customer Contacts (Family, Friends)
CREATE TABLE IF NOT EXISTS customer_contacts (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Contact Details
  contact_name TEXT NOT NULL,
  contact_mobile TEXT NOT NULL,
  contact_email TEXT,
  
  -- Relationship
  relation TEXT, -- 'FAMILY', 'FRIEND', 'COLLEAGUE', 'EMERGENCY'
  relation_detail TEXT, -- 'SPOUSE', 'PARENT', 'SIBLING', 'CHILD'
  
  -- Emergency Contact
  is_emergency_contact BOOLEAN DEFAULT FALSE,
  
  -- Verification
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP WITH TIME ZONE,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_contacts_customer_id_idx ON customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS customer_contacts_is_emergency_idx ON customer_contacts(is_emergency_contact) WHERE is_emergency_contact = TRUE;

-- Customer Saved Locations (Favorites)
CREATE TABLE IF NOT EXISTS customer_saved_locations (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Location Details
  location_name TEXT NOT NULL,
  location_type TEXT, -- 'HOME', 'WORK', 'FAVORITE', 'RECENT'
  
  -- Address
  formatted_address TEXT NOT NULL,
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  
  -- Usage
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  -- Status
  is_favorite BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_saved_locations_customer_id_idx ON customer_saved_locations(customer_id);
CREATE INDEX IF NOT EXISTS customer_saved_locations_is_favorite_idx ON customer_saved_locations(is_favorite) WHERE is_favorite = TRUE;

-- ============================================================================
-- PHASE 3: PREFERENCES & SETTINGS
-- ============================================================================

-- Customer Preferences
CREATE TABLE IF NOT EXISTS customer_preferences (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Service Preferences
  default_service service_type DEFAULT 'FOOD',
  
  -- Delivery Preferences
  contact_less_delivery_default BOOLEAN DEFAULT FALSE,
  leave_at_door_default BOOLEAN DEFAULT FALSE,
  
  -- Payment Preferences
  preferred_payment_method payment_method_type,
  auto_apply_wallet BOOLEAN DEFAULT TRUE,
  
  -- Ordering Preferences
  save_delivery_instructions BOOLEAN DEFAULT TRUE,
  reorder_favorites BOOLEAN DEFAULT TRUE,
  
  -- Communication Preferences
  allow_calls BOOLEAN DEFAULT TRUE,
  allow_sms BOOLEAN DEFAULT TRUE,
  allow_whatsapp BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(customer_id)
);

CREATE INDEX IF NOT EXISTS customer_preferences_customer_id_idx ON customer_preferences(customer_id);

-- Customer Notification Preferences
CREATE TABLE IF NOT EXISTS customer_notification_preferences (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Notification Types
  order_updates BOOLEAN DEFAULT TRUE,
  promotional_notifications BOOLEAN DEFAULT TRUE,
  offer_notifications BOOLEAN DEFAULT TRUE,
  loyalty_notifications BOOLEAN DEFAULT TRUE,
  
  -- Channels
  push_notifications BOOLEAN DEFAULT TRUE,
  email_notifications BOOLEAN DEFAULT TRUE,
  sms_notifications BOOLEAN DEFAULT TRUE,
  whatsapp_notifications BOOLEAN DEFAULT FALSE,
  
  -- Timing
  quiet_hours_enabled BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(customer_id)
);

CREATE INDEX IF NOT EXISTS customer_notification_preferences_customer_id_idx ON customer_notification_preferences(customer_id);

-- Customer Privacy Settings
CREATE TABLE IF NOT EXISTS customer_privacy_settings (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Privacy Controls
  share_location BOOLEAN DEFAULT TRUE,
  share_profile_with_riders BOOLEAN DEFAULT TRUE,
  show_order_history BOOLEAN DEFAULT TRUE,
  
  -- Marketing Consent
  marketing_consent BOOLEAN DEFAULT FALSE,
  marketing_consent_date TIMESTAMP WITH TIME ZONE,
  
  -- Data Sharing
  share_data_with_partners BOOLEAN DEFAULT FALSE,
  
  -- GDPR
  gdpr_consent BOOLEAN DEFAULT TRUE,
  gdpr_consent_date TIMESTAMP WITH TIME ZONE,
  data_processing_consent BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(customer_id)
);

CREATE INDEX IF NOT EXISTS customer_privacy_settings_customer_id_idx ON customer_privacy_settings(customer_id);

-- ============================================================================
-- PHASE 4: FINANCIAL (WALLET & PAYMENTS)
-- ============================================================================

-- Customer Payment Methods
CREATE TABLE IF NOT EXISTS customer_payment_methods (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Payment Method
  payment_type payment_method_type NOT NULL,
  provider TEXT, -- 'RAZORPAY', 'STRIPE', 'PAYTM', 'PHONEPE', 'GPAY'
  
  -- Card Details (Tokenized)
  card_token TEXT,
  card_last4 TEXT,
  card_brand TEXT, -- 'VISA', 'MASTERCARD', 'RUPAY'
  card_expiry_month INTEGER,
  card_expiry_year INTEGER,
  card_holder_name TEXT,
  
  -- UPI
  upi_id TEXT,
  upi_verified BOOLEAN DEFAULT FALSE,
  
  -- Wallet
  wallet_provider TEXT,
  wallet_phone TEXT,
  
  -- Bank
  bank_name TEXT,
  
  -- Status
  is_default BOOLEAN DEFAULT FALSE,
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Security
  token_reference TEXT, -- Gateway token reference
  
  -- Usage
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS customer_payment_methods_customer_id_idx ON customer_payment_methods(customer_id);
CREATE INDEX IF NOT EXISTS customer_payment_methods_is_default_idx ON customer_payment_methods(is_default) WHERE is_default = TRUE;
CREATE INDEX IF NOT EXISTS customer_payment_methods_is_active_idx ON customer_payment_methods(is_active) WHERE is_active = TRUE AND deleted_at IS NULL;

-- Customer Wallet
CREATE TABLE IF NOT EXISTS customer_wallet (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Balance
  current_balance NUMERIC(12, 2) DEFAULT 0.0,
  locked_amount NUMERIC(12, 2) DEFAULT 0.0,
  available_balance NUMERIC(12, 2) DEFAULT 0.0,
  
  -- Limits
  max_balance NUMERIC(12, 2) DEFAULT 10000.0,
  min_transaction_amount NUMERIC(10, 2) DEFAULT 1.0,
  max_transaction_amount NUMERIC(10, 2) DEFAULT 10000.0,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  kyc_verified BOOLEAN DEFAULT FALSE,
  
  -- Last Transaction
  last_transaction_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(customer_id)
);

CREATE INDEX IF NOT EXISTS customer_wallet_customer_id_idx ON customer_wallet(customer_id);

-- Customer Wallet Transactions
CREATE TABLE IF NOT EXISTS customer_wallet_transactions (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Transaction Details
  transaction_id TEXT NOT NULL UNIQUE,
  transaction_type wallet_transaction_type NOT NULL,
  
  -- Amount
  amount NUMERIC(12, 2) NOT NULL,
  balance_before NUMERIC(12, 2) NOT NULL,
  balance_after NUMERIC(12, 2) NOT NULL,
  
  -- Reference
  reference_id TEXT, -- Order ID, refund ID, etc.
  reference_type TEXT, -- 'ORDER', 'REFUND', 'TOPUP', 'CASHBACK', 'BONUS'
  
  -- Description
  description TEXT NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'COMPLETED', -- 'PENDING', 'COMPLETED', 'FAILED', 'REVERSED'
  
  -- Gateway Details (for topup)
  pg_transaction_id TEXT,
  pg_response JSONB DEFAULT '{}',
  
  -- Metadata
  transaction_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_wallet_transactions_customer_id_idx ON customer_wallet_transactions(customer_id);
CREATE INDEX IF NOT EXISTS customer_wallet_transactions_transaction_id_idx ON customer_wallet_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS customer_wallet_transactions_transaction_type_idx ON customer_wallet_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS customer_wallet_transactions_reference_idx ON customer_wallet_transactions(reference_id, reference_type);
CREATE INDEX IF NOT EXISTS customer_wallet_transactions_created_at_idx ON customer_wallet_transactions(created_at);

-- Customer Payment History (All Payments)
CREATE TABLE IF NOT EXISTS customer_payment_history (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  
  -- Payment Details
  payment_id TEXT NOT NULL UNIQUE,
  payment_method payment_method_type NOT NULL,
  payment_provider TEXT,
  
  -- Amount
  payment_amount NUMERIC(12, 2) NOT NULL,
  
  -- Status
  payment_status TEXT NOT NULL, -- 'PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'
  
  -- Gateway
  pg_order_id TEXT,
  pg_payment_id TEXT,
  pg_transaction_id TEXT,
  
  -- Failure
  failure_reason TEXT,
  failure_code TEXT,
  
  -- Metadata
  payment_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_payment_history_customer_id_idx ON customer_payment_history(customer_id);
CREATE INDEX IF NOT EXISTS customer_payment_history_order_id_idx ON customer_payment_history(order_id);
CREATE INDEX IF NOT EXISTS customer_payment_history_payment_status_idx ON customer_payment_history(payment_status);

-- Customer Tips Given
CREATE TABLE IF NOT EXISTS customer_tips_given (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
  
  -- Tip Details
  tip_amount NUMERIC(10, 2) NOT NULL,
  tip_message TEXT,
  
  -- Status
  tip_paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_tips_given_customer_id_idx ON customer_tips_given(customer_id);
CREATE INDEX IF NOT EXISTS customer_tips_given_order_id_idx ON customer_tips_given(order_id);
CREATE INDEX IF NOT EXISTS customer_tips_given_rider_id_idx ON customer_tips_given(rider_id);

-- Continue in Part 2...
