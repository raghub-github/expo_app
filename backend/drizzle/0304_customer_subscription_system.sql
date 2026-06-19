-- Customer subscription plans — dynamic GMitra Plus managed from Super Admin.
-- Extends subscription_plans (shared with rider GMitra Max) via plan_audience.
-- Migration: 0304_customer_subscription_system

DO $$ BEGIN
  ALTER TYPE public.subscription_billing_cycle ADD VALUE IF NOT EXISTS 'weekly';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_plan_audience AS ENUM ('RIDER', 'CUSTOMER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS plan_audience public.subscription_plan_audience NOT NULL DEFAULT 'RIDER',
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS free_delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_free_delivery_radius_km NUMERIC(6, 2) NOT NULL DEFAULT 7.00,
  ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5, 2) NULL,
  ADD COLUMN IF NOT EXISTS cashback_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cashback_percentage NUMERIC(5, 2) NULL,
  ADD COLUMN IF NOT EXISTS priority_support BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.subscription_plans.plan_audience IS 'RIDER = GMitra Max; CUSTOMER = GMitra Plus / user plans.';
COMMENT ON COLUMN public.subscription_plans.is_featured IS 'Only one CUSTOMER plan may be featured globally.';
COMMENT ON COLUMN public.subscription_plans.max_free_delivery_radius_km IS 'Free delivery waived only when distance <= this km. Default 7.';

UPDATE public.subscription_plans SET plan_audience = 'RIDER' WHERE plan_audience IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_one_featured_customer_idx
  ON public.subscription_plans ((TRUE))
  WHERE plan_audience = 'CUSTOMER' AND is_featured = TRUE;

CREATE INDEX IF NOT EXISTS subscription_plans_customer_active_idx
  ON public.subscription_plans (plan_audience, is_active, display_order)
  WHERE plan_audience = 'CUSTOMER';

DO $$ BEGIN
  CREATE TYPE public.customer_subscription_status AS ENUM ('active', 'expired', 'cancelled', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.customer_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  plan_id BIGINT NOT NULL REFERENCES public.subscription_plans (id) ON DELETE RESTRICT,
  price_id BIGINT NULL REFERENCES public.subscription_plan_prices (id) ON DELETE SET NULL,
  billing_cycle public.subscription_billing_cycle NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status public.customer_subscription_status NOT NULL DEFAULT 'active',
  amount_paid NUMERIC(10, 2) NULL,
  razorpay_order_id TEXT NULL,
  razorpay_payment_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customers'
  ) THEN
    ALTER TABLE public.customer_subscriptions
      DROP CONSTRAINT IF EXISTS customer_subscriptions_customer_id_fk;
    ALTER TABLE public.customer_subscriptions
      ADD CONSTRAINT customer_subscriptions_customer_id_fk
      FOREIGN KEY (customer_id) REFERENCES public.customers (id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS customer_subscriptions_customer_status_idx
  ON public.customer_subscriptions (customer_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS customer_subscriptions_plan_idx
  ON public.customer_subscriptions (plan_id);
