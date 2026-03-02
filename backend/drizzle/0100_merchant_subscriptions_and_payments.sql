-- Merchant Subscriptions & Subscription Payments
-- Enums + merchant_subscriptions + subscription_payments (store_id se active plan fetch).

DO $$ BEGIN
  CREATE TYPE public.subscription_status_type AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'CANCELLED',
    'TRIAL',
    'EXPIRED',
    'PENDING'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_payment_status_type AS ENUM (
    'PENDING',
    'PAID',
    'FAILED',
    'REFUNDED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.merchant_subscriptions (
  id BIGSERIAL NOT NULL,
  merchant_id BIGINT NOT NULL,
  store_id BIGINT NULL,
  plan_id BIGINT NOT NULL,
  subscription_status public.subscription_status_type NOT NULL DEFAULT 'INACTIVE'::public.subscription_status_type,
  payment_status public.subscription_payment_status_type NOT NULL DEFAULT 'PENDING'::public.subscription_payment_status_type,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  expiry_date TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN NULL DEFAULT false,
  auto_renew BOOLEAN NULL DEFAULT false,
  last_payment_date TIMESTAMP WITH TIME ZONE NULL,
  next_billing_date TIMESTAMP WITH TIME ZONE NULL,
  cancelled_at TIMESTAMP WITH TIME ZONE NULL,
  cancellation_reason TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  auto_pay_enabled_at TIMESTAMP WITH TIME ZONE NULL,
  auto_pay_disabled_at TIMESTAMP WITH TIME ZONE NULL,
  last_auto_pay_attempt TIMESTAMP WITH TIME ZONE NULL,
  auto_pay_failure_count INTEGER NULL DEFAULT 0,
  razorpay_customer_id TEXT NULL,
  razorpay_subscription_id TEXT NULL,
  payment_method TEXT NULL,
  payment_method_details JSONB NULL DEFAULT '{}'::jsonb,
  auto_pay_enabled_by BIGINT NULL,
  auto_pay_disabled_by BIGINT NULL,
  next_auto_pay_date TIMESTAMP WITH TIME ZONE NULL,
  upgraded_from BIGINT NULL,
  credit_applied NUMERIC(10, 2) NULL DEFAULT 0,
  billing_start_at TIMESTAMP WITH TIME ZONE NULL,
  billing_end_at TIMESTAMP WITH TIME ZONE NULL,
  CONSTRAINT merchant_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT merchant_subscriptions_plan_id_fk FOREIGN KEY (plan_id) REFERENCES merchant_plans (id) ON DELETE RESTRICT,
  CONSTRAINT auto_renew_next_billing_check CHECK (
    (auto_renew = false)
    OR (auto_renew = true AND next_billing_date IS NOT NULL)
  )
) TABLESPACE pg_default;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_name = 'merchant_parents') THEN
    ALTER TABLE public.merchant_subscriptions
      ADD CONSTRAINT merchant_subscriptions_merchant_id_fk
      FOREIGN KEY (merchant_id) REFERENCES public.merchant_parents (id) ON DELETE RESTRICT;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_name = 'merchant_stores') THEN
    ALTER TABLE public.merchant_subscriptions
      ADD CONSTRAINT merchant_subscriptions_store_id_fk
      FOREIGN KEY (store_id) REFERENCES public.merchant_stores (id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS merchant_subscriptions_merchant_id_idx ON public.merchant_subscriptions USING btree (merchant_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS merchant_subscriptions_store_id_idx ON public.merchant_subscriptions USING btree (store_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS merchant_subscriptions_plan_id_idx ON public.merchant_subscriptions USING btree (plan_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS merchant_subscriptions_status_idx ON public.merchant_subscriptions USING btree (subscription_status) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS merchant_subscriptions_is_active_idx ON public.merchant_subscriptions USING btree (is_active) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS merchant_subscriptions_auto_renew_idx ON public.merchant_subscriptions USING btree (auto_renew) TABLESPACE pg_default
  WHERE (auto_renew = true AND is_active = true);
CREATE INDEX IF NOT EXISTS merchant_subscriptions_next_billing_date_idx ON public.merchant_subscriptions USING btree (next_billing_date) TABLESPACE pg_default
  WHERE (auto_renew = true AND is_active = true AND subscription_status = 'ACTIVE'::public.subscription_status_type);
CREATE INDEX IF NOT EXISTS merchant_subscriptions_next_auto_pay_date_idx ON public.merchant_subscriptions USING btree (next_auto_pay_date) TABLESPACE pg_default
  WHERE (auto_renew = true AND is_active = true);
CREATE INDEX IF NOT EXISTS merchant_subscriptions_razorpay_subscription_id_idx ON public.merchant_subscriptions USING btree (razorpay_subscription_id) TABLESPACE pg_default
  WHERE (razorpay_subscription_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_subscription_per_store ON public.merchant_subscriptions USING btree (
  merchant_id,
  COALESCE(store_id, (-1)::bigint)
) TABLESPACE pg_default
  WHERE (subscription_status = 'ACTIVE'::public.subscription_status_type);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid WHERE c.relname = 'merchant_subscriptions' AND t.tgname = 'update_merchant_subscriptions_updated_at') THEN
    CREATE TRIGGER update_merchant_subscriptions_updated_at
      BEFORE UPDATE ON public.merchant_subscriptions
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
EXCEPTION
  WHEN undefined_function THEN NULL;
END $$;

-- subscription_payments
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id BIGSERIAL NOT NULL,
  merchant_id BIGINT NOT NULL,
  store_id BIGINT NULL,
  subscription_id BIGINT NOT NULL,
  plan_id BIGINT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  payment_gateway TEXT NULL,
  payment_gateway_id TEXT NULL,
  payment_gateway_response JSONB NULL,
  payment_status public.subscription_payment_status_type NOT NULL DEFAULT 'PENDING'::public.subscription_payment_status_type,
  payment_date TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  billing_period_start TIMESTAMP WITH TIME ZONE NULL,
  billing_period_end TIMESTAMP WITH TIME ZONE NULL,
  refunded_at TIMESTAMP WITH TIME ZONE NULL,
  refund_amount NUMERIC(10, 2) NULL,
  refund_reason TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  CONSTRAINT subscription_payments_pkey PRIMARY KEY (id),
  CONSTRAINT subscription_payments_plan_id_fk FOREIGN KEY (plan_id) REFERENCES merchant_plans (id) ON DELETE RESTRICT,
  CONSTRAINT subscription_payments_subscription_id_fk FOREIGN KEY (subscription_id) REFERENCES merchant_subscriptions (id) ON DELETE RESTRICT
) TABLESPACE pg_default;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_name = 'merchant_parents') THEN
    ALTER TABLE public.subscription_payments
      ADD CONSTRAINT subscription_payments_merchant_id_fk
      FOREIGN KEY (merchant_id) REFERENCES public.merchant_parents (id) ON DELETE RESTRICT;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_name = 'merchant_stores') THEN
    ALTER TABLE public.subscription_payments
      ADD CONSTRAINT subscription_payments_store_id_fk
      FOREIGN KEY (store_id) REFERENCES public.merchant_stores (id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS subscription_payments_merchant_id_idx ON public.subscription_payments USING btree (merchant_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS subscription_payments_store_id_idx ON public.subscription_payments USING btree (store_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS subscription_payments_subscription_id_idx ON public.subscription_payments USING btree (subscription_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS subscription_payments_payment_status_idx ON public.subscription_payments USING btree (payment_status) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS subscription_payments_payment_date_idx ON public.subscription_payments USING btree (payment_date) TABLESPACE pg_default;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid WHERE c.relname = 'subscription_payments' AND t.tgname = 'update_subscription_payments_updated_at') THEN
    CREATE TRIGGER update_subscription_payments_updated_at
      BEFORE UPDATE ON public.subscription_payments
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
EXCEPTION
  WHEN undefined_function THEN NULL;
END $$;
