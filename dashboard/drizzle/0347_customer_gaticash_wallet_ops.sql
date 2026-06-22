-- ============================================================================
-- 0347: GatiCash ops — phone-change requests, top-up intents, settings guard
-- Run AFTER 0345_customer_gaticash_wallet_enums.sql + 0346_customer_gaticash_wallet_v1.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Phone change requests (support workflow; balance not auto-transferred)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_wallet_phone_change_requests (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  current_mobile TEXT NOT NULL,
  requested_mobile TEXT NOT NULL,
  requested_mobile_normalized TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED')),
  balance_at_request NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (balance_at_request >= 0),
  no_transfer_acknowledged BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_wallet_phone_change_requests_customer_idx
  ON public.customer_wallet_phone_change_requests(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_wallet_phone_change_requests_status_idx
  ON public.customer_wallet_phone_change_requests(status);

CREATE UNIQUE INDEX IF NOT EXISTS customer_wallet_phone_change_requests_one_pending_idx
  ON public.customer_wallet_phone_change_requests(customer_id)
  WHERE status IN ('PENDING', 'IN_REVIEW');

COMMENT ON TABLE public.customer_wallet_phone_change_requests IS
  'GatiCash phone change requests. Wallet balance is not transferred automatically.';

-- ---------------------------------------------------------------------------
-- 2. Top-up payment intents (PG integration / idempotent credit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_wallet_topup_intents (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  intent_id TEXT NOT NULL UNIQUE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  auto_add_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_add_amount NUMERIC(12, 2) CHECK (auto_add_amount IS NULL OR auto_add_amount >= 0),
  auto_add_threshold NUMERIC(12, 2) CHECK (auto_add_threshold IS NULL OR auto_add_threshold >= 0),
  status TEXT NOT NULL DEFAULT 'CREATED'
    CHECK (status IN ('CREATED', 'PAYMENT_PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED')),
  pg_order_id TEXT,
  pg_payment_id TEXT,
  wallet_transaction_id BIGINT REFERENCES public.customer_wallet_transactions(id) ON DELETE SET NULL,
  failure_reason TEXT,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_wallet_topup_intents_customer_idx
  ON public.customer_wallet_topup_intents(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_wallet_topup_intents_status_idx
  ON public.customer_wallet_topup_intents(status);

COMMENT ON TABLE public.customer_wallet_topup_intents IS
  'GatiCash add-money payment intents before PG confirmation.';

-- ---------------------------------------------------------------------------
-- 3. Settings validation — auto-add threshold cannot exceed auto-add amount
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_wallet_settings_auto_add_threshold_lte_amount'
  ) THEN
    ALTER TABLE public.customer_wallet_settings
      ADD CONSTRAINT customer_wallet_settings_auto_add_threshold_lte_amount
      CHECK (
        NOT auto_add_enabled
        OR auto_add_amount <= 0
        OR auto_add_threshold <= auto_add_amount
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Upsert settings helper (used by API)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_customer_wallet_settings(
  p_customer_id BIGINT,
  p_auto_add_enabled BOOLEAN DEFAULT NULL,
  p_auto_add_amount NUMERIC(12, 2) DEFAULT NULL,
  p_auto_add_threshold NUMERIC(12, 2) DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings_id BIGINT;
  v_enabled BOOLEAN;
  v_amount NUMERIC(12, 2);
  v_threshold NUMERIC(12, 2);
BEGIN
  PERFORM public.get_or_create_customer_wallet(p_customer_id);

  SELECT id, auto_add_enabled, auto_add_amount, auto_add_threshold
  INTO v_settings_id, v_enabled, v_amount, v_threshold
  FROM public.customer_wallet_settings
  WHERE customer_id = p_customer_id
  FOR UPDATE;

  IF v_settings_id IS NULL THEN
    INSERT INTO public.customer_wallet_settings (customer_id)
    VALUES (p_customer_id)
    RETURNING id INTO v_settings_id;
    SELECT auto_add_enabled, auto_add_amount, auto_add_threshold
    INTO v_enabled, v_amount, v_threshold
    FROM public.customer_wallet_settings
    WHERE id = v_settings_id;
  END IF;

  v_enabled := COALESCE(p_auto_add_enabled, v_enabled);
  v_amount := COALESCE(p_auto_add_amount, v_amount);
  v_threshold := COALESCE(p_auto_add_threshold, v_threshold);

  IF v_enabled AND v_amount > 0 AND v_threshold > v_amount THEN
    RAISE EXCEPTION 'auto_add_threshold cannot exceed auto_add_amount';
  END IF;

  UPDATE public.customer_wallet_settings
  SET
    auto_add_enabled = v_enabled,
    auto_add_amount = GREATEST(COALESCE(v_amount, 0), 0),
    auto_add_threshold = GREATEST(COALESCE(v_threshold, 0), 0),
    updated_at = NOW()
  WHERE id = v_settings_id;

  RETURN v_settings_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Monthly top-up counter reset helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_wallet_reset_monthly_topup_if_needed(p_customer_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_month_key TEXT := to_char(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM');
BEGIN
  UPDATE public.customer_wallet_settings
  SET
    monthly_topup_used = 0,
    topup_month_key = v_month_key,
    updated_at = NOW()
  WHERE customer_id = p_customer_id
    AND (topup_month_key IS DISTINCT FROM v_month_key);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.customer_wallet_phone_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_wallet_topup_intents ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS customer_wallet_phone_change_requests_updated_at_trigger
  ON public.customer_wallet_phone_change_requests;

CREATE TRIGGER customer_wallet_phone_change_requests_updated_at_trigger
  BEFORE UPDATE ON public.customer_wallet_phone_change_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS customer_wallet_topup_intents_updated_at_trigger
  ON public.customer_wallet_topup_intents;

CREATE TRIGGER customer_wallet_topup_intents_updated_at_trigger
  BEFORE UPDATE ON public.customer_wallet_topup_intents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
