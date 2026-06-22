-- ============================================================================
-- 0346: GatiCash (customer wallet) — settings, credit lots, expiry, helpers
-- PART 2 of 2 — run AFTER 0345_customer_gaticash_wallet_enums.sql
-- Run on the shared Postgres used by backend + customer app APIs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. customer_wallet policy columns + raise limits to ₹50,000
-- ---------------------------------------------------------------------------
ALTER TABLE public.customer_wallet
  ADD COLUMN IF NOT EXISTS added_balance_expiry_years INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';

ALTER TABLE public.customer_wallet
  ALTER COLUMN max_balance SET DEFAULT 50000.0,
  ALTER COLUMN max_transaction_amount SET DEFAULT 50000.0;

UPDATE public.customer_wallet
SET
  max_balance = GREATEST(COALESCE(max_balance, 0), 50000.0),
  max_transaction_amount = GREATEST(COALESCE(max_transaction_amount, 0), 50000.0),
  added_balance_expiry_years = COALESCE(added_balance_expiry_years, 10),
  currency = COALESCE(NULLIF(currency, ''), 'INR'),
  available_balance = GREATEST(
    COALESCE(current_balance, 0) - COALESCE(locked_amount, 0),
    0
  )
WHERE TRUE;

COMMENT ON COLUMN public.customer_wallet.added_balance_expiry_years IS
  'Validity in years for customer-added GatiCash top-ups (default 10 years).';

-- ---------------------------------------------------------------------------
-- 2. Per-customer GatiCash settings (auto-add, monthly top-up cap)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_wallet_settings (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL UNIQUE REFERENCES public.customers(id) ON DELETE CASCADE,
  auto_add_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_add_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (auto_add_amount >= 0),
  auto_add_threshold NUMERIC(12, 2) NOT NULL DEFAULT 500 CHECK (auto_add_threshold >= 0),
  monthly_topup_limit NUMERIC(12, 2) NOT NULL DEFAULT 50000 CHECK (monthly_topup_limit >= 0),
  monthly_topup_used NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (monthly_topup_used >= 0),
  topup_month_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_wallet_settings_customer_id_idx
  ON public.customer_wallet_settings(customer_id);

COMMENT ON TABLE public.customer_wallet_settings IS
  'GatiCash preferences: auto-add, monthly top-up usage tracking.';

-- ---------------------------------------------------------------------------
-- 3. Credit lots — FIFO buckets with optional expiry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_wallet_credit_lots (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  wallet_transaction_id BIGINT REFERENCES public.customer_wallet_transactions(id) ON DELETE SET NULL,
  lot_type public.customer_wallet_balance_lot_type NOT NULL DEFAULT 'ADDED',
  original_amount NUMERIC(12, 2) NOT NULL CHECK (original_amount > 0),
  remaining_amount NUMERIC(12, 2) NOT NULL CHECK (remaining_amount >= 0),
  expires_at TIMESTAMPTZ,
  status public.customer_wallet_lot_status NOT NULL DEFAULT 'ACTIVE',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_wallet_credit_lots_remaining_lte_original
    CHECK (remaining_amount <= original_amount)
);

CREATE INDEX IF NOT EXISTS customer_wallet_credit_lots_customer_id_idx
  ON public.customer_wallet_credit_lots(customer_id);

CREATE INDEX IF NOT EXISTS customer_wallet_credit_lots_active_expiry_idx
  ON public.customer_wallet_credit_lots(customer_id, expires_at)
  WHERE status = 'ACTIVE' AND remaining_amount > 0;

CREATE INDEX IF NOT EXISTS customer_wallet_credit_lots_status_idx
  ON public.customer_wallet_credit_lots(status);

COMMENT ON TABLE public.customer_wallet_credit_lots IS
  'GatiCash balance components with optional expiry (added money default 10 years).';

-- ---------------------------------------------------------------------------
-- 4. Backfill wallets + settings for existing customers
-- ---------------------------------------------------------------------------
INSERT INTO public.customer_wallet (
  customer_id,
  current_balance,
  locked_amount,
  available_balance,
  max_balance,
  max_transaction_amount,
  added_balance_expiry_years,
  currency
)
SELECT
  c.id,
  COALESCE(c.wallet_balance, 0),
  COALESCE(c.wallet_locked_amount, 0),
  GREATEST(COALESCE(c.wallet_balance, 0) - COALESCE(c.wallet_locked_amount, 0), 0),
  50000.0,
  50000.0,
  10,
  'INR'
FROM public.customers c
LEFT JOIN public.customer_wallet cw ON cw.customer_id = c.id
WHERE cw.id IS NULL;

INSERT INTO public.customer_wallet_settings (customer_id)
SELECT c.id
FROM public.customers c
LEFT JOIN public.customer_wallet_settings cws ON cws.customer_id = c.id
WHERE cws.id IS NULL;

INSERT INTO public.customer_wallet_credit_lots (
  customer_id,
  lot_type,
  original_amount,
  remaining_amount,
  expires_at,
  status,
  metadata
)
SELECT
  cw.customer_id,
  'ADDED'::public.customer_wallet_balance_lot_type,
  cw.current_balance,
  cw.current_balance,
  NOW() + make_interval(years => COALESCE(cw.added_balance_expiry_years, 10)),
  'ACTIVE'::public.customer_wallet_lot_status,
  jsonb_build_object('source', '0346_backfill')
FROM public.customer_wallet cw
WHERE COALESCE(cw.current_balance, 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.customer_wallet_credit_lots l
    WHERE l.customer_id = cw.customer_id
  );

-- ---------------------------------------------------------------------------
-- 5. Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_customer_wallet(p_customer_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id BIGINT;
BEGIN
  SELECT id INTO v_wallet_id
  FROM public.customer_wallet
  WHERE customer_id = p_customer_id;

  IF v_wallet_id IS NOT NULL THEN
    RETURN v_wallet_id;
  END IF;

  INSERT INTO public.customer_wallet (
    customer_id,
    current_balance,
    locked_amount,
    available_balance,
    max_balance,
    max_transaction_amount,
    added_balance_expiry_years,
    currency
  ) VALUES (
    p_customer_id,
    0,
    0,
    0,
    50000.0,
    50000.0,
    10,
    'INR'
  )
  ON CONFLICT (customer_id) DO NOTHING
  RETURNING id INTO v_wallet_id;

  IF v_wallet_id IS NULL THEN
    SELECT id INTO v_wallet_id
    FROM public.customer_wallet
    WHERE customer_id = p_customer_id;
  END IF;

  INSERT INTO public.customer_wallet_settings (customer_id)
  VALUES (p_customer_id)
  ON CONFLICT (customer_id) DO NOTHING;

  RETURN v_wallet_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_customer_wallet_settings(p_customer_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings_id BIGINT;
BEGIN
  PERFORM public.get_or_create_customer_wallet(p_customer_id);

  SELECT id INTO v_settings_id
  FROM public.customer_wallet_settings
  WHERE customer_id = p_customer_id;

  IF v_settings_id IS NOT NULL THEN
    RETURN v_settings_id;
  END IF;

  INSERT INTO public.customer_wallet_settings (customer_id)
  VALUES (p_customer_id)
  ON CONFLICT (customer_id) DO NOTHING
  RETURNING id INTO v_settings_id;

  IF v_settings_id IS NULL THEN
    SELECT id INTO v_settings_id
    FROM public.customer_wallet_settings
    WHERE customer_id = p_customer_id;
  END IF;

  RETURN v_settings_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_wallet_is_credit_type(p_type public.wallet_transaction_type)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_type::text IN ('CREDIT', 'TOPUP', 'REFUND', 'BONUS', 'CASHBACK', 'ADJUSTMENT');
$$;

CREATE OR REPLACE FUNCTION public.customer_wallet_is_debit_type(p_type public.wallet_transaction_type)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_type::text IN ('DEBIT', 'EXPIRED', 'REVERSAL');
$$;

CREATE OR REPLACE FUNCTION public.customer_wallet_default_lot_type(
  p_type public.wallet_transaction_type
)
RETURNS public.customer_wallet_balance_lot_type
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_type::text
    WHEN 'TOPUP' THEN 'ADDED'::public.customer_wallet_balance_lot_type
    WHEN 'REFUND' THEN 'REFUND'::public.customer_wallet_balance_lot_type
    WHEN 'BONUS' THEN 'BONUS'::public.customer_wallet_balance_lot_type
    WHEN 'CASHBACK' THEN 'CASHBACK'::public.customer_wallet_balance_lot_type
    ELSE 'ADDED'::public.customer_wallet_balance_lot_type
  END;
$$;

CREATE OR REPLACE FUNCTION public.customer_wallet_credit(
  p_customer_id BIGINT,
  p_amount NUMERIC(12, 2),
  p_transaction_type public.wallet_transaction_type DEFAULT 'TOPUP',
  p_reference_id TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_pg_transaction_id TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_lot_type public.customer_wallet_balance_lot_type DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id BIGINT;
  v_tx_id BIGINT;
  v_balance_before NUMERIC(12, 2);
  v_balance_after NUMERIC(12, 2);
  v_max_balance NUMERIC(12, 2);
  v_expiry_years INTEGER;
  v_lot_type public.customer_wallet_balance_lot_type;
  v_expires_at TIMESTAMPTZ;
  v_tx_key TEXT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF NOT public.customer_wallet_is_credit_type(p_transaction_type) THEN
    RAISE EXCEPTION 'transaction type % is not a credit type', p_transaction_type;
  END IF;

  v_wallet_id := public.get_or_create_customer_wallet(p_customer_id);

  v_tx_key := COALESCE(
    NULLIF(BTRIM(p_idempotency_key), ''),
    'gaticash_credit_' || p_customer_id || '_' || gen_random_uuid()::text
  );

  SELECT id INTO v_tx_id
  FROM public.customer_wallet_transactions
  WHERE transaction_id = v_tx_key;

  IF v_tx_id IS NOT NULL THEN
    RETURN v_tx_id;
  END IF;

  SELECT current_balance, max_balance, added_balance_expiry_years
  INTO v_balance_before, v_max_balance, v_expiry_years
  FROM public.customer_wallet
  WHERE id = v_wallet_id
  FOR UPDATE;

  v_balance_after := v_balance_before + p_amount;
  IF v_balance_after > v_max_balance THEN
    RAISE EXCEPTION 'wallet max balance exceeded (limit %)', v_max_balance;
  END IF;

  INSERT INTO public.customer_wallet_transactions (
    customer_id,
    transaction_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    reference_id,
    reference_type,
    description,
    status,
    pg_transaction_id,
    transaction_metadata
  ) VALUES (
    p_customer_id,
    v_tx_key,
    p_transaction_type,
    p_amount,
    v_balance_before,
    v_balance_after,
    p_reference_id,
    p_reference_type,
    COALESCE(NULLIF(BTRIM(p_description), ''), 'GatiCash credited'),
    'COMPLETED',
    p_pg_transaction_id,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_tx_id;

  v_lot_type := COALESCE(p_lot_type, public.customer_wallet_default_lot_type(p_transaction_type));

  IF v_lot_type = 'ADDED'::public.customer_wallet_balance_lot_type
     AND p_expires_at IS NULL
     AND COALESCE(v_expiry_years, 10) > 0 THEN
    v_expires_at := NOW() + make_interval(years => COALESCE(v_expiry_years, 10));
  ELSE
    v_expires_at := p_expires_at;
  END IF;

  INSERT INTO public.customer_wallet_credit_lots (
    customer_id,
    wallet_transaction_id,
    lot_type,
    original_amount,
    remaining_amount,
    expires_at,
    status,
    metadata
  ) VALUES (
    p_customer_id,
    v_tx_id,
    v_lot_type,
    p_amount,
    p_amount,
    v_expires_at,
    'ACTIVE'::public.customer_wallet_lot_status,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_wallet_debit(
  p_customer_id BIGINT,
  p_amount NUMERIC(12, 2),
  p_transaction_type public.wallet_transaction_type DEFAULT 'DEBIT',
  p_reference_id TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_skip_lot_allocation BOOLEAN DEFAULT FALSE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id BIGINT;
  v_tx_id BIGINT;
  v_balance_before NUMERIC(12, 2);
  v_balance_after NUMERIC(12, 2);
  v_available NUMERIC(12, 2);
  v_remaining NUMERIC(12, 2);
  v_lot RECORD;
  v_take NUMERIC(12, 2);
  v_tx_key TEXT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF NOT public.customer_wallet_is_debit_type(p_transaction_type) THEN
    RAISE EXCEPTION 'transaction type % is not a debit type', p_transaction_type;
  END IF;

  v_wallet_id := public.get_or_create_customer_wallet(p_customer_id);

  v_tx_key := COALESCE(
    NULLIF(BTRIM(p_idempotency_key), ''),
    'gaticash_debit_' || p_customer_id || '_' || gen_random_uuid()::text
  );

  SELECT id INTO v_tx_id
  FROM public.customer_wallet_transactions
  WHERE transaction_id = v_tx_key;

  IF v_tx_id IS NOT NULL THEN
    RETURN v_tx_id;
  END IF;

  SELECT current_balance, available_balance
  INTO v_balance_before, v_available
  FROM public.customer_wallet
  WHERE id = v_wallet_id
  FOR UPDATE;

  IF v_available < p_amount THEN
    RAISE EXCEPTION 'insufficient GatiCash balance (available %, requested %)', v_available, p_amount;
  END IF;

  v_balance_after := v_balance_before - p_amount;

  INSERT INTO public.customer_wallet_transactions (
    customer_id,
    transaction_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    reference_id,
    reference_type,
    description,
    status,
    transaction_metadata
  ) VALUES (
    p_customer_id,
    v_tx_key,
    p_transaction_type,
    p_amount,
    v_balance_before,
    v_balance_after,
    p_reference_id,
    p_reference_type,
    COALESCE(NULLIF(BTRIM(p_description), ''), 'GatiCash debited'),
    'COMPLETED',
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_tx_id;

  IF NOT p_skip_lot_allocation THEN
    v_remaining := p_amount;
    FOR v_lot IN
      SELECT id, remaining_amount
      FROM public.customer_wallet_credit_lots
      WHERE customer_id = p_customer_id
        AND status = 'ACTIVE'::public.customer_wallet_lot_status
        AND remaining_amount > 0
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY expires_at NULLS LAST, created_at ASC, id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_lot.remaining_amount, v_remaining);
      UPDATE public.customer_wallet_credit_lots
      SET
        remaining_amount = remaining_amount - v_take,
        status = CASE
          WHEN remaining_amount - v_take <= 0 THEN 'DEPLETED'::public.customer_wallet_lot_status
          ELSE status
        END,
        updated_at = NOW()
      WHERE id = v_lot.id;
      v_remaining := v_remaining - v_take;
    END LOOP;
  END IF;

  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_wallet_expire_due_lots(p_customer_id BIGINT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lot RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_lot IN
    SELECT customer_id, id, remaining_amount
    FROM public.customer_wallet_credit_lots
    WHERE status = 'ACTIVE'::public.customer_wallet_lot_status
      AND remaining_amount > 0
      AND expires_at IS NOT NULL
      AND expires_at <= NOW()
      AND (p_customer_id IS NULL OR customer_id = p_customer_id)
    ORDER BY expires_at ASC, id ASC
    FOR UPDATE
  LOOP
    PERFORM public.customer_wallet_debit(
      v_lot.customer_id,
      v_lot.remaining_amount,
      'EXPIRED'::public.wallet_transaction_type,
      v_lot.id::text,
      'LOT_EXPIRY',
      'GatiCash balance expired',
      'gaticash_expire_lot_' || v_lot.id::text,
      jsonb_build_object('credit_lot_id', v_lot.id),
      TRUE
    );

    UPDATE public.customer_wallet_credit_lots
    SET
      remaining_amount = 0,
      status = 'EXPIRED'::public.customer_wallet_lot_status,
      updated_at = NOW()
    WHERE id = v_lot.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_wallet_lock_amount(
  p_customer_id BIGINT,
  p_amount NUMERIC(12, 2)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'lock amount must be positive';
  END IF;

  PERFORM public.get_or_create_customer_wallet(p_customer_id);

  UPDATE public.customer_wallet
  SET
    locked_amount = locked_amount + p_amount,
    available_balance = GREATEST(current_balance - (locked_amount + p_amount), 0),
    updated_at = NOW()
  WHERE customer_id = p_customer_id
    AND available_balance >= p_amount;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient available GatiCash to lock %', p_amount;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_wallet_unlock_amount(
  p_customer_id BIGINT,
  p_amount NUMERIC(12, 2)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'unlock amount must be positive';
  END IF;

  UPDATE public.customer_wallet
  SET
    locked_amount = GREATEST(locked_amount - p_amount, 0),
    available_balance = GREATEST(current_balance - GREATEST(locked_amount - p_amount, 0), 0),
    updated_at = NOW()
  WHERE customer_id = p_customer_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Triggers — balance sync + legacy customers.wallet_balance mirror
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_customer_wallet_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.customer_wallet
  SET
    current_balance = NEW.balance_after,
    available_balance = GREATEST(NEW.balance_after - COALESCE(locked_amount, 0), 0),
    last_transaction_at = NEW.created_at,
    updated_at = NOW()
  WHERE customer_id = NEW.customer_id;

  UPDATE public.customers
  SET
    wallet_balance = NEW.balance_after,
    updated_at = NOW()
  WHERE id = NEW.customer_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_wallet_transactions_balance_trigger
  ON public.customer_wallet_transactions;

CREATE TRIGGER customer_wallet_transactions_balance_trigger
  AFTER INSERT ON public.customer_wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_customer_wallet_balance();

CREATE OR REPLACE FUNCTION public.sync_customers_wallet_locked_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.customers
  SET
    wallet_locked_amount = NEW.locked_amount,
    wallet_balance = NEW.current_balance,
    updated_at = NOW()
  WHERE id = NEW.customer_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_wallet_sync_customers_trigger ON public.customer_wallet;

CREATE TRIGGER customer_wallet_sync_customers_trigger
  AFTER UPDATE OF current_balance, locked_amount, available_balance ON public.customer_wallet
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customers_wallet_locked_amount();

DROP TRIGGER IF EXISTS customer_wallet_settings_updated_at_trigger ON public.customer_wallet_settings;

CREATE TRIGGER customer_wallet_settings_updated_at_trigger
  BEFORE UPDATE ON public.customer_wallet_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS customer_wallet_credit_lots_updated_at_trigger ON public.customer_wallet_credit_lots;

CREATE TRIGGER customer_wallet_credit_lots_updated_at_trigger
  BEFORE UPDATE ON public.customer_wallet_credit_lots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 7. RLS (match existing customer wallet tables)
-- ---------------------------------------------------------------------------
ALTER TABLE public.customer_wallet_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_wallet_credit_lots ENABLE ROW LEVEL SECURITY;
