-- GMitra Max subscription system (dedicated tables)
-- Replaces legacy rider_subscriptions → merchant_plans linkage from 0255

DROP TABLE IF EXISTS public.rider_subscriptions CASCADE;

DO $$ BEGIN
  CREATE TYPE public.subscription_billing_cycle AS ENUM ('daily', 'monthly', 'semi_yearly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.rider_subscription_status AS ENUM ('active', 'paused', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  badge_text TEXT NULL,
  badge_color TEXT NULL DEFAULT '#7C3AED',
  headline TEXT NULL,
  cta_label TEXT NULL DEFAULT 'Subscribe now',
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscription_plans_code_uniq UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS public.subscription_plan_prices (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES public.subscription_plans (id) ON DELETE CASCADE,
  billing_cycle public.subscription_billing_cycle NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  auto_wallet_deduction BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscription_plan_prices_plan_cycle_uniq UNIQUE (plan_id, billing_cycle)
);

CREATE TABLE IF NOT EXISTS public.subscription_plan_benefits (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES public.subscription_plans (id) ON DELETE CASCADE,
  benefit_key TEXT NOT NULL,
  benefit_value TEXT NOT NULL,
  display_label TEXT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscription_plan_benefits_plan_key_uniq UNIQUE (plan_id, benefit_key)
);

CREATE TABLE IF NOT EXISTS public.rider_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  rider_id BIGINT NOT NULL,
  plan_id BIGINT NOT NULL REFERENCES public.subscription_plans (id) ON DELETE RESTRICT,
  price_id BIGINT NULL REFERENCES public.subscription_plan_prices (id) ON DELETE SET NULL,
  billing_cycle public.subscription_billing_cycle NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
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

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'riders') THEN
    ALTER TABLE public.rider_subscriptions
      ADD CONSTRAINT rider_subscriptions_rider_id_fk
      FOREIGN KEY (rider_id) REFERENCES public.riders (id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS subscription_plans_active_idx ON public.subscription_plans (is_active, display_order);
CREATE INDEX IF NOT EXISTS subscription_plan_prices_plan_idx ON public.subscription_plan_prices (plan_id, is_active);
CREATE INDEX IF NOT EXISTS subscription_plan_benefits_plan_idx ON public.subscription_plan_benefits (plan_id, display_order);
CREATE INDEX IF NOT EXISTS rider_subscriptions_rider_status_idx ON public.rider_subscriptions (rider_id, status, end_date);

INSERT INTO public.subscription_plans (code, name, description, badge_text, badge_color, headline, cta_label, display_order)
VALUES (
  'GMITRA_MAX',
  'GMitra Max',
  'Premium membership for priority orders, higher earnings, and exclusive rewards.',
  'POPULAR',
  '#7C3AED',
  'Earn More. Get Priority. Grow Faster.',
  'Subscribe now',
  1
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  badge_text = EXCLUDED.badge_text,
  badge_color = EXCLUDED.badge_color,
  headline = EXCLUDED.headline,
  cta_label = EXCLUDED.cta_label,
  updated_at = now();

INSERT INTO public.subscription_plan_prices (plan_id, billing_cycle, amount, auto_wallet_deduction, is_active)
SELECT p.id, v.billing_cycle, v.amount, v.auto_wallet, true
FROM public.subscription_plans p
CROSS JOIN (
  VALUES
    ('daily'::public.subscription_billing_cycle, 10::numeric, true),
    ('monthly'::public.subscription_billing_cycle, 199::numeric, false),
    ('semi_yearly'::public.subscription_billing_cycle, 999::numeric, false),
    ('yearly'::public.subscription_billing_cycle, 1799::numeric, false)
) AS v(billing_cycle, amount, auto_wallet)
WHERE p.code = 'GMITRA_MAX'
ON CONFLICT (plan_id, billing_cycle) DO UPDATE SET
  amount = EXCLUDED.amount,
  auto_wallet_deduction = EXCLUDED.auto_wallet_deduction,
  is_active = true;

INSERT INTO public.subscription_plan_benefits (plan_id, benefit_key, benefit_value, display_label, display_order)
SELECT p.id, b.benefit_key, b.benefit_value, b.display_label, b.display_order
FROM public.subscription_plans p
CROSS JOIN (
  VALUES
    ('priority_order_boost', '20', 'Priority Orders', 1),
    ('earnings_boost_percent', '20', 'Up to 20% Higher Earnings', 2),
    ('peak_hour_multiplier', '1.25', 'Peak Hour Boost', 3),
    ('faster_payouts', 'true', 'Faster Payouts', 4),
    ('penalty_waiver_count', '1', 'Monthly Penalty Waiver', 5),
    ('premium_support', 'true', 'Premium Rider Support', 6),
    ('reward_multiplier', '1.5', 'Exclusive Rewards & Bonuses', 7)
) AS b(benefit_key, benefit_value, display_label, display_order)
WHERE p.code = 'GMITRA_MAX'
ON CONFLICT (plan_id, benefit_key) DO UPDATE SET
  benefit_value = EXCLUDED.benefit_value,
  display_label = EXCLUDED.display_label,
  display_order = EXCLUDED.display_order;
