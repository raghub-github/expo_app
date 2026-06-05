-- Fix legacy 0255 rider_subscriptions schema + GST + default billing for app sheet

-- Drop legacy table (0255 used subscription_status / merchant_plans FK)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rider_subscriptions' AND column_name = 'subscription_status'
  ) THEN
    DROP TABLE public.rider_subscriptions CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS public.rider_subscriptions_active_idx;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS default_billing_cycle public.subscription_billing_cycle NULL DEFAULT 'monthly';

ALTER TABLE public.subscription_plan_prices
  ADD COLUMN IF NOT EXISTS gst_percent NUMERIC(5, 2) NOT NULL DEFAULT 18;

-- Ensure rider_subscriptions exists (0256 schema) before adding GST columns
CREATE TABLE IF NOT EXISTS public.rider_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  rider_id BIGINT NOT NULL,
  plan_id BIGINT NOT NULL REFERENCES public.subscription_plans (id) ON DELETE RESTRICT,
  price_id BIGINT NULL REFERENCES public.subscription_plan_prices (id) ON DELETE SET NULL,
  billing_cycle public.subscription_billing_cycle NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  subtotal_amount NUMERIC(10, 2) NULL,
  gst_percent_applied NUMERIC(5, 2) NULL,
  gst_amount NUMERIC(10, 2) NULL,
  amount_paid NUMERIC(10, 2) NULL,
  status public.rider_subscription_status NOT NULL DEFAULT 'active',
  auto_wallet_deduction BOOLEAN NOT NULL DEFAULT false,
  last_deduction_at TIMESTAMPTZ NULL,
  next_deduction_at TIMESTAMPTZ NULL,
  razorpay_order_id TEXT NULL,
  razorpay_payment_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rider_subscriptions
  ADD COLUMN IF NOT EXISTS gst_percent_applied NUMERIC(5, 2) NULL,
  ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(10, 2) NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'riders') THEN
    ALTER TABLE public.rider_subscriptions
      DROP CONSTRAINT IF EXISTS rider_subscriptions_rider_id_fk;
    ALTER TABLE public.rider_subscriptions
      ADD CONSTRAINT rider_subscriptions_rider_id_fk
      FOREIGN KEY (rider_id) REFERENCES public.riders (id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS rider_subscriptions_rider_status_idx
  ON public.rider_subscriptions (rider_id, status, end_date);

UPDATE public.subscription_plans SET default_billing_cycle = 'monthly' WHERE code = 'GMITRA_MAX' AND default_billing_cycle IS NULL;

UPDATE public.subscription_plan_prices pr
SET gst_percent = 18
FROM public.subscription_plans p
WHERE pr.plan_id = p.id AND p.code = 'GMITRA_MAX';
