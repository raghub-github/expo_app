-- Merchant onboarding payments: Razorpay and payment audit.
-- Tracks who paid, how much, for which store, and full payment gateway details.

CREATE TABLE IF NOT EXISTS public.merchant_onboarding_payments (
  id BIGSERIAL PRIMARY KEY,

  -- Who is paying (parent merchant)
  merchant_parent_id BIGINT NOT NULL REFERENCES public.merchant_parents(id) ON DELETE RESTRICT,

  -- Which store is being onboarded (nullable until store is created after payment)
  merchant_store_id BIGINT REFERENCES public.merchant_stores(id) ON DELETE SET NULL,

  -- Amount and currency
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',

  -- Display / plan context (for reporting and super admin updates)
  plan_id TEXT,
  plan_name TEXT,
  standard_amount_paise INTEGER,
  promo_amount_paise INTEGER,
  promo_label TEXT,

  -- Razorpay
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  razorpay_signature TEXT,
  razorpay_status TEXT,

  -- Payment status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded', 'cancelled')),

  -- Payer and request context
  payer_email TEXT,
  payer_phone TEXT,
  payer_name TEXT,
  ip_address TEXT,
  user_agent TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  captured_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,

  -- Audit and extensibility
  metadata JSONB NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE public.merchant_onboarding_payments IS 'All merchant onboarding fee payments (Razorpay); used for reconciliation and super admin reporting.';

CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_merchant_parent_id_idx
  ON public.merchant_onboarding_payments(merchant_parent_id);
CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_merchant_store_id_idx
  ON public.merchant_onboarding_payments(merchant_store_id)
  WHERE merchant_store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_razorpay_order_id_idx
  ON public.merchant_onboarding_payments(razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_razorpay_payment_id_idx
  ON public.merchant_onboarding_payments(razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_status_idx
  ON public.merchant_onboarding_payments(status);
CREATE INDEX IF NOT EXISTS merchant_onboarding_payments_created_at_idx
  ON public.merchant_onboarding_payments(created_at DESC);
