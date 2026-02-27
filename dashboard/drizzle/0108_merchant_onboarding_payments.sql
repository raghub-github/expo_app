-- Ensure merchant_onboarding_payments exists for verification step 6 (Commission plan).
-- Fetched by merchant_store_id (and optionally merchant_parent_id). Run only if table is missing.

CREATE TABLE IF NOT EXISTS public.merchant_onboarding_payments (
  id bigserial NOT NULL,
  merchant_parent_id bigint NOT NULL,
  merchant_store_id bigint NULL,
  amount_paise integer NOT NULL,
  currency text NOT NULL DEFAULT 'INR'::text,
  plan_id text NULL,
  plan_name text NULL,
  standard_amount_paise integer NULL,
  promo_amount_paise integer NULL,
  promo_label text NULL,
  razorpay_order_id text NULL,
  razorpay_payment_id text NULL,
  razorpay_signature text NULL,
  razorpay_status text NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  payer_email text NULL,
  payer_phone text NULL,
  payer_name text NULL,
  ip_address text NULL,
  user_agent text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  captured_at timestamp with time zone NULL,
  failed_at timestamp with time zone NULL,
  failure_reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT merchant_onboarding_payments_pkey PRIMARY KEY (id),
  CONSTRAINT merchant_onboarding_payments_razorpay_order_id_key UNIQUE (razorpay_order_id),
  CONSTRAINT merchant_onboarding_payments_razorpay_payment_id_key UNIQUE (razorpay_payment_id),
  CONSTRAINT merchant_onboarding_payments_merchant_parent_id_fkey FOREIGN KEY (merchant_parent_id) REFERENCES merchant_parents (id) ON DELETE RESTRICT,
  CONSTRAINT merchant_onboarding_payments_merchant_store_id_fkey FOREIGN KEY (merchant_store_id) REFERENCES merchant_stores (id) ON DELETE SET NULL,
  CONSTRAINT merchant_onboarding_payments_amount_paise_check CHECK ((amount_paise >= 0)),
  CONSTRAINT merchant_onboarding_payments_status_check CHECK (
    (status = ANY (ARRAY['pending'::text, 'created'::text, 'authorized'::text, 'captured'::text, 'failed'::text, 'refunded'::text, 'partially_refunded'::text, 'cancelled'::text]))
  )
);

CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_merchant_parent_id_idx ON public.merchant_onboarding_payments USING btree (merchant_parent_id);
CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_merchant_store_id_idx ON public.merchant_onboarding_payments USING btree (merchant_store_id) WHERE (merchant_store_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_razorpay_order_id_idx ON public.merchant_onboarding_payments USING btree (razorpay_order_id) WHERE (razorpay_order_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_razorpay_payment_id_idx ON public.merchant_onboarding_payments USING btree (razorpay_payment_id) WHERE (razorpay_payment_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_status_idx ON public.merchant_onboarding_payments USING btree (status);
CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_created_at_idx ON public.merchant_onboarding_payments USING btree (created_at DESC);
