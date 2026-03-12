-- Merchant onboarding payments (Razorpay) for subscription / setup fees
CREATE TABLE IF NOT EXISTS public.merchant_onboarding_payments (
  id BIGSERIAL NOT NULL,
  merchant_parent_id BIGINT NOT NULL,
  merchant_store_id BIGINT NULL,
  amount_paise INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR'::text,
  plan_id TEXT NULL,
  plan_name TEXT NULL,
  standard_amount_paise INTEGER NULL,
  promo_amount_paise INTEGER NULL,
  promo_label TEXT NULL,
  razorpay_order_id TEXT NULL,
  razorpay_payment_id TEXT NULL,
  razorpay_signature TEXT NULL,
  razorpay_status TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  payer_email TEXT NULL,
  payer_phone TEXT NULL,
  payer_name TEXT NULL,
  ip_address TEXT NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_at TIMESTAMPTZ NULL,
  failed_at TIMESTAMPTZ NULL,
  failure_reason TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT merchant_onboarding_payments_pkey PRIMARY KEY (id),
  CONSTRAINT merchant_onboarding_payments_razorpay_order_id_key UNIQUE (razorpay_order_id),
  CONSTRAINT merchant_onboarding_payments_razorpay_payment_id_key UNIQUE (razorpay_payment_id),
  CONSTRAINT merchant_onboarding_payments_merchant_parent_id_fkey FOREIGN KEY (merchant_parent_id) REFERENCES merchant_parents (id) ON DELETE RESTRICT,
  CONSTRAINT merchant_onboarding_payments_merchant_store_id_fkey FOREIGN KEY (merchant_store_id) REFERENCES merchant_stores (id) ON DELETE SET NULL,
  CONSTRAINT merchant_onboarding_payments_amount_paise_check CHECK (amount_paise >= 0),
  CONSTRAINT merchant_onboarding_payments_status_check CHECK (
    status = ANY (
      ARRAY[
        'pending'::text,
        'created'::text,
        'authorized'::text,
        'captured'::text,
        'failed'::text,
        'refunded'::text,
        'partially_refunded'::text,
        'cancelled'::text
      ]
    )
  )
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_merchant_parent_id_idx
  ON public.merchant_onboarding_payments USING btree (merchant_parent_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_merchant_store_id_idx
  ON public.merchant_onboarding_payments USING btree (merchant_store_id) TABLESPACE pg_default
  WHERE merchant_store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_razorpay_order_id_idx
  ON public.merchant_onboarding_payments USING btree (razorpay_order_id) TABLESPACE pg_default
  WHERE razorpay_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_razorpay_payment_id_idx
  ON public.merchant_onboarding_payments USING btree (razorpay_payment_id) TABLESPACE pg_default
  WHERE razorpay_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_status_idx
  ON public.merchant_onboarding_payments USING btree (status) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_created_at_idx
  ON public.merchant_onboarding_payments USING btree (created_at DESC) TABLESPACE pg_default;

