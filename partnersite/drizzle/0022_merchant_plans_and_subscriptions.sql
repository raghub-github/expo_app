-- Migration: Merchant Plans and Subscriptions System
-- Purpose: Create tables for plan management, subscriptions, and payments
-- Date: 2026-02-17

-- ============================================
-- ENUM TYPES
-- ============================================

-- Billing Cycle Type
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_cycle_type') THEN
    CREATE TYPE billing_cycle_type AS ENUM ('MONTHLY', 'YEARLY');
  END IF;
END $$;

-- Subscription Status Type
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status_type') THEN
    CREATE TYPE subscription_status_type AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING_PAYMENT');
  END IF;
END $$;

-- Subscription Payment Status Type (separate from order payment_status_type)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_payment_status_type') THEN
    CREATE TYPE subscription_payment_status_type AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');
  END IF;
END $$;

-- ============================================
-- PLANS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.merchant_plans (
  id BIGSERIAL PRIMARY KEY,
  plan_name TEXT NOT NULL UNIQUE,
  plan_code TEXT NOT NULL UNIQUE, -- e.g., 'FREE', 'PREMIUM', 'ENTERPRISE'
  description TEXT,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  billing_cycle billing_cycle_type NOT NULL DEFAULT 'MONTHLY',
  
  -- Feature limits
  max_menu_items INTEGER DEFAULT NULL, -- NULL = unlimited
  max_cuisines INTEGER DEFAULT NULL, -- NULL = unlimited
  max_menu_categories INTEGER DEFAULT NULL, -- NULL = unlimited
  image_upload_allowed BOOLEAN DEFAULT false,
  max_image_uploads INTEGER DEFAULT 0, -- 0 = not allowed
  
  -- Feature flags
  analytics_access BOOLEAN DEFAULT false,
  advanced_analytics BOOLEAN DEFAULT false,
  priority_support BOOLEAN DEFAULT false,
  marketing_automation BOOLEAN DEFAULT false,
  custom_api_integrations BOOLEAN DEFAULT false,
  dedicated_account_manager BOOLEAN DEFAULT false,
  
  -- Display
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_popular BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_plans_plan_code_idx ON public.merchant_plans(plan_code);
CREATE INDEX IF NOT EXISTS merchant_plans_is_active_idx ON public.merchant_plans(is_active);

-- ============================================
-- MERCHANT SUBSCRIPTIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.merchant_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  merchant_id BIGINT NOT NULL, -- FK to merchant_parents(id)
  store_id BIGINT, -- FK to merchant_stores(id) - NULL means applies to all stores of merchant
  plan_id BIGINT NOT NULL, -- FK to merchant_plans(id)
  
  subscription_status subscription_status_type NOT NULL DEFAULT 'INACTIVE',
  payment_status subscription_payment_status_type NOT NULL DEFAULT 'PENDING',
  
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  expiry_date TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT false,
  auto_renew BOOLEAN DEFAULT false, -- Changed default to false
  
  -- Auto-pay tracking
  auto_pay_enabled_at TIMESTAMP WITH TIME ZONE,
  auto_pay_disabled_at TIMESTAMP WITH TIME ZONE,
  last_auto_pay_attempt TIMESTAMP WITH TIME ZONE,
  auto_pay_failure_count INTEGER DEFAULT 0,
  razorpay_customer_id TEXT,
  razorpay_subscription_id TEXT, -- For recurring subscriptions
  payment_method TEXT, -- e.g., 'RAZORPAY', 'CARD', 'UPI', 'NETBANKING'
  payment_method_details JSONB DEFAULT '{}'::jsonb, -- Store payment method details securely
  auto_pay_enabled_by BIGINT, -- User ID who enabled auto-pay
  auto_pay_disabled_by BIGINT, -- User ID who disabled auto-pay
  next_auto_pay_date TIMESTAMP WITH TIME ZONE, -- When next auto-pay will be attempted
  
  -- Payment tracking
  last_payment_date TIMESTAMP WITH TIME ZONE,
  next_billing_date TIMESTAMP WITH TIME ZONE,
  
  -- Cancellation
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT merchant_subscriptions_merchant_id_fk 
    FOREIGN KEY (merchant_id) REFERENCES public.merchant_parents(id) ON DELETE RESTRICT,
  CONSTRAINT merchant_subscriptions_store_id_fk 
    FOREIGN KEY (store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  CONSTRAINT merchant_subscriptions_plan_id_fk 
    FOREIGN KEY (plan_id) REFERENCES public.merchant_plans(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS merchant_subscriptions_merchant_id_idx ON public.merchant_subscriptions(merchant_id);
CREATE INDEX IF NOT EXISTS merchant_subscriptions_store_id_idx ON public.merchant_subscriptions(store_id);
CREATE INDEX IF NOT EXISTS merchant_subscriptions_plan_id_idx ON public.merchant_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS merchant_subscriptions_status_idx ON public.merchant_subscriptions(subscription_status);
CREATE INDEX IF NOT EXISTS merchant_subscriptions_is_active_idx ON public.merchant_subscriptions(is_active);
CREATE INDEX IF NOT EXISTS merchant_subscriptions_auto_renew_idx ON public.merchant_subscriptions(auto_renew) WHERE auto_renew = true AND is_active = true;
CREATE INDEX IF NOT EXISTS merchant_subscriptions_next_billing_date_idx ON public.merchant_subscriptions(next_billing_date) WHERE auto_renew = true AND is_active = true AND subscription_status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS merchant_subscriptions_next_auto_pay_date_idx ON public.merchant_subscriptions(next_auto_pay_date) WHERE auto_renew = true AND is_active = true;
CREATE INDEX IF NOT EXISTS merchant_subscriptions_razorpay_subscription_id_idx ON public.merchant_subscriptions(razorpay_subscription_id) WHERE razorpay_subscription_id IS NOT NULL;

-- ============================================
-- SUBSCRIPTION PAYMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id BIGSERIAL PRIMARY KEY,
  merchant_id BIGINT NOT NULL, -- FK to merchant_parents(id)
  store_id BIGINT, -- FK to merchant_stores(id)
  subscription_id BIGINT NOT NULL, -- FK to merchant_subscriptions(id)
  plan_id BIGINT NOT NULL, -- FK to merchant_plans(id)
  
  amount NUMERIC(10, 2) NOT NULL,
  payment_gateway TEXT, -- e.g., 'RAZORPAY', 'STRIPE', 'CASH', 'MANUAL'
  payment_gateway_id TEXT, -- Transaction ID from gateway
  payment_gateway_response JSONB, -- Full response from gateway
  
  payment_status subscription_payment_status_type NOT NULL DEFAULT 'PENDING',
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Billing period
  billing_period_start TIMESTAMP WITH TIME ZONE,
  billing_period_end TIMESTAMP WITH TIME ZONE,
  
  -- Refund info
  refunded_at TIMESTAMP WITH TIME ZONE,
  refund_amount NUMERIC(10, 2),
  refund_reason TEXT,
  
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT subscription_payments_merchant_id_fk 
    FOREIGN KEY (merchant_id) REFERENCES public.merchant_parents(id) ON DELETE RESTRICT,
  CONSTRAINT subscription_payments_store_id_fk 
    FOREIGN KEY (store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  CONSTRAINT subscription_payments_subscription_id_fk 
    FOREIGN KEY (subscription_id) REFERENCES public.merchant_subscriptions(id) ON DELETE RESTRICT,
  CONSTRAINT subscription_payments_plan_id_fk 
    FOREIGN KEY (plan_id) REFERENCES public.merchant_plans(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS subscription_payments_merchant_id_idx ON public.subscription_payments(merchant_id);
CREATE INDEX IF NOT EXISTS subscription_payments_store_id_idx ON public.subscription_payments(store_id);
CREATE INDEX IF NOT EXISTS subscription_payments_subscription_id_idx ON public.subscription_payments(subscription_id);
CREATE INDEX IF NOT EXISTS subscription_payments_payment_status_idx ON public.subscription_payments(payment_status);
CREATE INDEX IF NOT EXISTS subscription_payments_payment_date_idx ON public.subscription_payments(payment_date);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_merchant_plans_updated_at ON public.merchant_plans;
CREATE TRIGGER update_merchant_plans_updated_at
  BEFORE UPDATE ON public.merchant_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_merchant_subscriptions_updated_at ON public.merchant_subscriptions;
CREATE TRIGGER update_merchant_subscriptions_updated_at
  BEFORE UPDATE ON public.merchant_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscription_payments_updated_at ON public.subscription_payments;
CREATE TRIGGER update_subscription_payments_updated_at
  BEFORE UPDATE ON public.subscription_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED DATA: Default Plans
-- ============================================

INSERT INTO public.merchant_plans (plan_name, plan_code, description, price, billing_cycle, max_menu_items, max_cuisines, max_menu_categories, image_upload_allowed, max_image_uploads, analytics_access, advanced_analytics, priority_support, marketing_automation, custom_api_integrations, dedicated_account_manager, display_order, is_active, is_popular) VALUES
('Free Plan', 'FREE', 'Perfect for getting started', 0, 'MONTHLY', 15, 10, 5, false, 0, false, false, false, false, false, false, 1, true, false),
('Premium Plan', 'PREMIUM', 'For growing businesses', 999, 'MONTHLY', NULL, NULL, NULL, true, NULL, true, true, true, false, false, false, 2, true, true),
('Enterprise Plan', 'ENTERPRISE', 'For established businesses', 2499, 'MONTHLY', NULL, NULL, NULL, true, NULL, true, true, true, true, true, true, 3, true, false)
ON CONFLICT (plan_code) DO NOTHING;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get active subscription for a merchant/store
CREATE OR REPLACE FUNCTION get_active_subscription(p_merchant_id BIGINT, p_store_id BIGINT DEFAULT NULL)
RETURNS TABLE (
  subscription_id BIGINT,
  plan_id BIGINT,
  plan_code TEXT,
  plan_name TEXT,
  max_menu_items INTEGER,
  max_cuisines INTEGER,
  image_upload_allowed BOOLEAN,
  analytics_access BOOLEAN,
  advanced_analytics BOOLEAN,
  priority_support BOOLEAN,
  expiry_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    p.id,
    p.plan_code,
    p.plan_name,
    p.max_menu_items,
    p.max_cuisines,
    p.image_upload_allowed,
    p.analytics_access,
    p.advanced_analytics,
    p.priority_support,
    s.expiry_date
  FROM public.merchant_subscriptions s
  JOIN public.merchant_plans p ON s.plan_id = p.id
  WHERE s.merchant_id = p_merchant_id
    AND (p_store_id IS NULL OR s.store_id IS NULL OR s.store_id = p_store_id)
    AND s.is_active = true
    AND s.subscription_status = 'ACTIVE'
    AND s.expiry_date > NOW()
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to check if feature is available for merchant/store
CREATE OR REPLACE FUNCTION check_feature_access(
  p_merchant_id BIGINT,
  p_store_id BIGINT DEFAULT NULL,
  p_feature TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_plan_code TEXT;
BEGIN
  SELECT plan_code INTO v_plan_code
  FROM get_active_subscription(p_merchant_id, p_store_id);
  
  IF v_plan_code IS NULL THEN
    -- No active subscription, use FREE plan defaults
    RETURN false;
  END IF;
  
  -- Check specific features
  IF p_feature = 'image_upload' THEN
    RETURN EXISTS (
      SELECT 1 FROM get_active_subscription(p_merchant_id, p_store_id)
      WHERE image_upload_allowed = true
    );
  ELSIF p_feature = 'analytics' THEN
    RETURN EXISTS (
      SELECT 1 FROM get_active_subscription(p_merchant_id, p_store_id)
      WHERE analytics_access = true
    );
  ELSIF p_feature = 'advanced_analytics' THEN
    RETURN EXISTS (
      SELECT 1 FROM get_active_subscription(p_merchant_id, p_store_id)
      WHERE advanced_analytics = true
    );
  ELSIF p_feature = 'priority_support' THEN
    RETURN EXISTS (
      SELECT 1 FROM get_active_subscription(p_merchant_id, p_store_id)
      WHERE priority_support = true
    );
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;
