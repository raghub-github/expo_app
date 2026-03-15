-- ============================================================================
-- MERCHANT WALLET – LEDGER-BASED WALLET SYSTEM
-- Production-Grade Merchant Wallet (Swiggy/Zomato-style)
-- Migration: merchant_wallet
-- Database: PostgreSQL
--
-- DESIGN PRINCIPLES:
-- - Double-entry style: immutable ledger, balance snapshots, source references
-- - Credit only merchant share (merchant_net), never full customer payment
-- - Commission deducted at withdrawal time, not at credit time
-- - Wallet status: ACTIVE, SUSPENDED, FROZEN, BLOCKED (freeze = no debit/withdraw, credits allowed)
-- - Penalties as DEBIT ledger entries, not direct balance tweaks
-- - Idempotency keys, atomic transactions, concurrency-safe updates
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_transaction_direction') THEN
    CREATE TYPE wallet_transaction_direction AS ENUM (
      'CREDIT',
      'DEBIT'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_transaction_category') THEN
    CREATE TYPE wallet_transaction_category AS ENUM (
      -- CREDIT categories
      'ORDER_EARNING',
      'ORDER_ADJUSTMENT',
      'REFUND_REVERSAL',
      'FAILED_WITHDRAWAL_REVERSAL',
      'BONUS',
      'CASHBACK',
      'MANUAL_CREDIT',
      'SUBSCRIPTION_REFUND',
      -- DEBIT categories
      'WITHDRAWAL',
      'PENALTY',
      'SUBSCRIPTION_FEE',
      'COMMISSION_DEDUCTION',
      'ADJUSTMENT',
      'REFUND_TO_CUSTOMER',
      'MANUAL_DEBIT',
      'TAX_ADJUSTMENT'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_balance_type') THEN
    CREATE TYPE wallet_balance_type AS ENUM (
      'AVAILABLE',
      'PENDING',
      'HOLD',
      'RESERVE'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_reference_type') THEN
    CREATE TYPE wallet_reference_type AS ENUM (
      'ORDER',
      'WITHDRAWAL',
      'SUBSCRIPTION',
      'PENALTY',
      'SYSTEM',
      'ADMIN',
      'REFUND'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_status_type') THEN
    CREATE TYPE wallet_status_type AS ENUM (
      'ACTIVE',
      'SUSPENDED',
      'FROZEN',
      'BLOCKED'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payout_request_status_type') THEN
    CREATE TYPE payout_request_status_type AS ENUM (
      'PENDING',
      'APPROVED',
      'PROCESSING',
      'COMPLETED',
      'FAILED',
      'CANCELLED',
      'REVERSED'
    );
  END IF;
END $$;

-- ============================================================================
-- MERCHANT WALLET (one per merchant_store)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_wallet (
  id BIGSERIAL PRIMARY KEY,
  merchant_store_id BIGINT NOT NULL UNIQUE,
  merchant_parent_id BIGINT,

  -- Balance summary (derived from ledger; updated atomically with ledger inserts)
  available_balance NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  pending_balance NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (pending_balance >= 0),
  hold_balance NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (hold_balance >= 0),
  reserve_balance NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (reserve_balance >= 0),

  -- Lifetime aggregates (audit / reporting)
  total_earned NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_withdrawn NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_penalty NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_commission_deducted NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- Status: FROZEN = no withdrawal/debit, credits still allowed
  status wallet_status_type NOT NULL DEFAULT 'ACTIVE',

  -- Version for optimistic locking (concurrency-safe updates)
  version INTEGER NOT NULL DEFAULT 0,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT merchant_wallet_merchant_store_id_fkey
    FOREIGN KEY (merchant_store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  CONSTRAINT merchant_wallet_merchant_parent_id_fkey
    FOREIGN KEY (merchant_parent_id) REFERENCES public.merchant_parents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS merchant_wallet_merchant_store_id_idx ON public.merchant_wallet(merchant_store_id);
CREATE INDEX IF NOT EXISTS merchant_wallet_merchant_parent_id_idx ON public.merchant_wallet(merchant_parent_id) WHERE merchant_parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_wallet_status_idx ON public.merchant_wallet(status);

COMMENT ON TABLE public.merchant_wallet IS 'One wallet per merchant store. Ledger-based; balances are snapshots updated atomically with ledger inserts.';
COMMENT ON COLUMN public.merchant_wallet.available_balance IS 'Withdrawable balance.';
COMMENT ON COLUMN public.merchant_wallet.pending_balance IS 'Earnings not yet available (e.g. T+1 / T+3).';
COMMENT ON COLUMN public.merchant_wallet.hold_balance IS 'Amount held (e.g. pending payout approval).';
COMMENT ON COLUMN public.merchant_wallet.reserve_balance IS 'Reserved for disputes/chargebacks.';
COMMENT ON COLUMN public.merchant_wallet.status IS 'FROZEN: no withdrawal/debit; credits still allowed.';

-- ============================================================================
-- MERCHANT WALLET LEDGER (immutable; never UPDATE, only INSERT)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_wallet_ledger (
  id BIGSERIAL PRIMARY KEY,
  wallet_id BIGINT NOT NULL,

  direction wallet_transaction_direction NOT NULL,
  category wallet_transaction_category NOT NULL,
  balance_type wallet_balance_type NOT NULL,

  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),

  -- Running balance after this entry (snapshot)
  balance_after NUMERIC(14, 2) NOT NULL,

  -- Source reference
  reference_type wallet_reference_type NOT NULL,
  reference_id BIGINT,
  reference_extra TEXT,

  -- Idempotency: same idempotency_key => skip duplicate insert
  idempotency_key TEXT UNIQUE,

  description TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT merchant_wallet_ledger_wallet_id_fkey
    FOREIGN KEY (wallet_id) REFERENCES public.merchant_wallet(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_wallet_ledger_idempotency_key_idx
  ON public.merchant_wallet_ledger(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_wallet_ledger_wallet_id_created_idx ON public.merchant_wallet_ledger(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS merchant_wallet_ledger_reference_idx ON public.merchant_wallet_ledger(reference_type, reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_wallet_ledger_created_at_idx ON public.merchant_wallet_ledger(created_at);

COMMENT ON TABLE public.merchant_wallet_ledger IS 'Immutable ledger. Only INSERT; never UPDATE. Each row has balance_after snapshot.';

-- ============================================================================
-- MERCHANT WALLET TRANSACTIONS (log of every credit/debit; links to ledger)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_wallet_transactions (
  id BIGSERIAL PRIMARY KEY,
  wallet_id BIGINT NOT NULL,
  ledger_id BIGINT,

  direction wallet_transaction_direction NOT NULL,
  category wallet_transaction_category NOT NULL,

  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),

  reference_type wallet_reference_type NOT NULL,
  reference_id BIGINT,
  reference_extra TEXT,

  idempotency_key TEXT UNIQUE,

  description TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT merchant_wallet_transactions_wallet_id_fkey
    FOREIGN KEY (wallet_id) REFERENCES public.merchant_wallet(id) ON DELETE CASCADE,
  CONSTRAINT merchant_wallet_transactions_ledger_id_fkey
    FOREIGN KEY (ledger_id) REFERENCES public.merchant_wallet_ledger(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS merchant_wallet_transactions_wallet_id_created_idx ON public.merchant_wallet_transactions(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS merchant_wallet_transactions_reference_idx ON public.merchant_wallet_transactions(reference_type, reference_id) WHERE reference_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS merchant_wallet_transactions_idempotency_key_idx ON public.merchant_wallet_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ============================================================================
-- ORDER SETTLEMENT BREAKDOWN (per-order bill components & merchant share)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_settlement_breakdown (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,

  -- Bill components (customer-facing)
  item_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  gst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  packaging_charge NUMERIC(12, 2) NOT NULL DEFAULT 0,
  delivery_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  platform_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  coupon_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  merchant_funded_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,

  -- Merchant gross (item_total + packaging - merchant_funded_discount)
  merchant_gross NUMERIC(12, 2) NOT NULL DEFAULT 0,

  -- Commission: applied at withdrawal; stored here for record
  commission_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,

  -- Merchant net (credited to wallet when order delivered)
  merchant_net NUMERIC(12, 2) NOT NULL DEFAULT 0,

  -- Settlement state
  settled BOOLEAN NOT NULL DEFAULT FALSE,
  settled_at TIMESTAMP WITH TIME ZONE,
  ledger_id BIGINT,
  wallet_id BIGINT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT order_settlement_breakdown_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE,
  CONSTRAINT order_settlement_breakdown_ledger_id_fkey
    FOREIGN KEY (ledger_id) REFERENCES public.merchant_wallet_ledger(id) ON DELETE SET NULL,
  CONSTRAINT order_settlement_breakdown_wallet_id_fkey
    FOREIGN KEY (wallet_id) REFERENCES public.merchant_wallet(id) ON DELETE SET NULL,
  CONSTRAINT order_settlement_breakdown_order_id_unique UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS order_settlement_breakdown_order_id_idx ON public.order_settlement_breakdown(order_id);
CREATE INDEX IF NOT EXISTS order_settlement_breakdown_settled_idx ON public.order_settlement_breakdown(settled) WHERE settled = FALSE;
CREATE INDEX IF NOT EXISTS order_settlement_breakdown_wallet_id_idx ON public.order_settlement_breakdown(wallet_id) WHERE wallet_id IS NOT NULL;

COMMENT ON TABLE public.order_settlement_breakdown IS 'Per-order bill breakdown. merchant_net = amount credited to wallet. Commission deducted at withdrawal, not at credit.';

-- ============================================================================
-- PLATFORM COMMISSION RULES (commission % by store/parent/plan)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_commission_rules (
  id BIGSERIAL PRIMARY KEY,
  merchant_parent_id BIGINT,
  merchant_store_id BIGINT,

  commission_percentage NUMERIC(5, 2) NOT NULL CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,

  is_default BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT platform_commission_rules_merchant_parent_id_fkey
    FOREIGN KEY (merchant_parent_id) REFERENCES public.merchant_parents(id) ON DELETE CASCADE,
  CONSTRAINT platform_commission_rules_merchant_store_id_fkey
    FOREIGN KEY (merchant_store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  CONSTRAINT platform_commission_rules_store_or_parent_check
    CHECK (merchant_store_id IS NOT NULL OR merchant_parent_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS platform_commission_rules_store_id_idx ON public.platform_commission_rules(merchant_store_id) WHERE merchant_store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_commission_rules_parent_id_idx ON public.platform_commission_rules(merchant_parent_id) WHERE merchant_parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_commission_rules_effective_idx ON public.platform_commission_rules(effective_from, effective_to);

-- ============================================================================
-- MERCHANT PAYOUT REQUESTS (withdrawal flow; hold until approval)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_payout_requests (
  id BIGSERIAL PRIMARY KEY,
  wallet_id BIGINT NOT NULL,

  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  status payout_request_status_type NOT NULL DEFAULT 'PENDING',

  -- Commission deducted at withdrawal
  commission_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_payout_amount NUMERIC(14, 2) NOT NULL,

  -- Ledger: hold on request, debit on completion
  hold_ledger_id BIGINT,
  debit_ledger_id BIGINT,

  bank_account_id BIGINT,
  utr_reference TEXT,
  failure_reason TEXT,

  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT merchant_payout_requests_wallet_id_fkey
    FOREIGN KEY (wallet_id) REFERENCES public.merchant_wallet(id) ON DELETE CASCADE,
  CONSTRAINT merchant_payout_requests_hold_ledger_id_fkey
    FOREIGN KEY (hold_ledger_id) REFERENCES public.merchant_wallet_ledger(id) ON DELETE SET NULL,
  CONSTRAINT merchant_payout_requests_debit_ledger_id_fkey
    FOREIGN KEY (debit_ledger_id) REFERENCES public.merchant_wallet_ledger(id) ON DELETE SET NULL
  -- bank_account_id FK to merchant_store_bank_accounts(id) if that table exists
);

CREATE INDEX IF NOT EXISTS merchant_payout_requests_wallet_id_idx ON public.merchant_payout_requests(wallet_id);
CREATE INDEX IF NOT EXISTS merchant_payout_requests_status_idx ON public.merchant_payout_requests(status);
CREATE INDEX IF NOT EXISTS merchant_payout_requests_requested_at_idx ON public.merchant_payout_requests(requested_at DESC);

-- ============================================================================
-- MERCHANT PENALTIES (penalty as DEBIT ledger entry, not direct balance change)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_penalties (
  id BIGSERIAL PRIMARY KEY,
  wallet_id BIGINT NOT NULL,

  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),

  reason TEXT NOT NULL,
  penalty_type TEXT,
  reference_type wallet_reference_type NOT NULL DEFAULT 'ORDER',
  reference_id BIGINT,

  ledger_id BIGINT,
  status TEXT NOT NULL DEFAULT 'APPLIED',

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT merchant_penalties_wallet_id_fkey
    FOREIGN KEY (wallet_id) REFERENCES public.merchant_wallet(id) ON DELETE CASCADE,
  CONSTRAINT merchant_penalties_ledger_id_fkey
    FOREIGN KEY (ledger_id) REFERENCES public.merchant_wallet_ledger(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS merchant_penalties_wallet_id_idx ON public.merchant_penalties(wallet_id);
CREATE INDEX IF NOT EXISTS merchant_penalties_reference_idx ON public.merchant_penalties(reference_type, reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_penalties_created_at_idx ON public.merchant_penalties(created_at DESC);

COMMENT ON TABLE public.merchant_penalties IS 'Penalty creates a DEBIT ledger entry; balance is reduced via ledger, not by direct update.';

-- ============================================================================
-- MERCHANT SUBSCRIPTION (minimal placeholder for wallet context)
-- ============================================================================
-- Note: Your schema may already have merchant_subscriptions (plural). This table
-- is a minimal placeholder; use existing merchant_subscriptions if preferred.
CREATE TABLE IF NOT EXISTS public.merchant_subscription (
  id BIGSERIAL PRIMARY KEY,
  merchant_parent_id BIGINT NOT NULL,
  merchant_store_id BIGINT,

  plan_id BIGINT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT merchant_subscription_merchant_parent_id_fkey
    FOREIGN KEY (merchant_parent_id) REFERENCES public.merchant_parents(id) ON DELETE CASCADE,
  CONSTRAINT merchant_subscription_merchant_store_id_fkey
    FOREIGN KEY (merchant_store_id) REFERENCES public.merchant_stores(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS merchant_subscription_merchant_store_id_idx ON public.merchant_subscription(merchant_store_id) WHERE merchant_store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_subscription_merchant_parent_id_idx ON public.merchant_subscription(merchant_parent_id);

-- ============================================================================
-- FUNCTION: Get or create wallet for a merchant store
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_merchant_wallet(p_merchant_store_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id BIGINT;
  v_parent_id BIGINT;
BEGIN
  SELECT id, merchant_parent_id INTO v_wallet_id, v_parent_id
  FROM public.merchant_wallet
  WHERE merchant_store_id = p_merchant_store_id;

  IF v_wallet_id IS NOT NULL THEN
    RETURN v_wallet_id;
  END IF;

  SELECT parent_id INTO v_parent_id
  FROM public.merchant_stores
  WHERE id = p_merchant_store_id;

  INSERT INTO public.merchant_wallet (merchant_store_id, merchant_parent_id)
  VALUES (p_merchant_store_id, v_parent_id)
  ON CONFLICT (merchant_store_id) DO UPDATE SET updated_at = NOW()
  RETURNING id INTO v_wallet_id;

  RETURN v_wallet_id;
END;
$$;

-- ============================================================================
-- FUNCTION: Credit wallet (order earning / pending) – atomic ledger + summary
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merchant_wallet_credit(
  p_wallet_id BIGINT,
  p_amount NUMERIC(14, 2),
  p_category wallet_transaction_category,
  p_balance_type wallet_balance_type,
  p_reference_type wallet_reference_type,
  p_reference_id BIGINT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ledger_id BIGINT;
  v_balance_after NUMERIC(14, 2);
  v_current_avail NUMERIC(14, 2);
  v_current_pending NUMERIC(14, 2);
  v_current_hold NUMERIC(14, 2);
  v_current_reserve NUMERIC(14, 2);
  v_version INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  -- Idempotency: if key provided and exists, return existing ledger id
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_ledger_id FROM public.merchant_wallet_ledger
    WHERE idempotency_key = p_idempotency_key;
    IF v_ledger_id IS NOT NULL THEN
      RETURN v_ledger_id;
    END IF;
  END IF;

  -- Lock wallet row and read balances + version
  SELECT available_balance, pending_balance, hold_balance, reserve_balance, version
  INTO v_current_avail, v_current_pending, v_current_hold, v_current_reserve, v_version
  FROM public.merchant_wallet
  WHERE id = p_wallet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found: %', p_wallet_id;
  END IF;

  -- Compute new balance for the chosen balance_type
  CASE p_balance_type
    WHEN 'AVAILABLE' THEN v_balance_after := v_current_avail + p_amount; v_current_avail := v_balance_after;
    WHEN 'PENDING' THEN v_balance_after := v_current_pending + p_amount; v_current_pending := v_balance_after;
    WHEN 'HOLD' THEN v_balance_after := v_current_hold + p_amount; v_current_hold := v_balance_after;
    WHEN 'RESERVE' THEN v_balance_after := v_current_reserve + p_amount; v_current_reserve := v_balance_after;
    ELSE RAISE EXCEPTION 'invalid balance_type %', p_balance_type;
  END CASE;

  -- Insert ledger (immutable)
  INSERT INTO public.merchant_wallet_ledger (
    wallet_id, direction, category, balance_type, amount, balance_after,
    reference_type, reference_id, idempotency_key, description, metadata
  ) VALUES (
    p_wallet_id, 'CREDIT', p_category, p_balance_type, p_amount, v_balance_after,
    p_reference_type, p_reference_id, p_idempotency_key, p_description, p_metadata
  )
  RETURNING id INTO v_ledger_id;

  -- Update wallet summary + total_earned for ORDER_EARNING
  UPDATE public.merchant_wallet
  SET
    available_balance = v_current_avail,
    pending_balance = v_current_pending,
    hold_balance = v_current_hold,
    reserve_balance = v_current_reserve,
    total_earned = total_earned + CASE WHEN p_category = 'ORDER_EARNING' THEN p_amount ELSE 0 END,
    version = version + 1,
    updated_at = NOW()
  WHERE id = p_wallet_id AND version = v_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet version conflict; retry';
  END IF;

  -- Log transaction row
  INSERT INTO public.merchant_wallet_transactions (
    wallet_id, ledger_id, direction, category, amount,
    reference_type, reference_id, idempotency_key, description, metadata
  ) VALUES (
    p_wallet_id, v_ledger_id, 'CREDIT', p_category, p_amount,
    p_reference_type, p_reference_id, p_idempotency_key, p_description, p_metadata
  );

  RETURN v_ledger_id;
END;
$$;

-- ============================================================================
-- FUNCTION: Debit wallet (penalty, withdrawal, etc.) – atomic ledger + summary
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merchant_wallet_debit(
  p_wallet_id BIGINT,
  p_amount NUMERIC(14, 2),
  p_category wallet_transaction_category,
  p_balance_type wallet_balance_type,
  p_reference_type wallet_reference_type,
  p_reference_id BIGINT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ledger_id BIGINT;
  v_balance_after NUMERIC(14, 2);
  v_current_avail NUMERIC(14, 2);
  v_current_pending NUMERIC(14, 2);
  v_current_hold NUMERIC(14, 2);
  v_current_reserve NUMERIC(14, 2);
  v_version INTEGER;
  v_status wallet_status_type;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_ledger_id FROM public.merchant_wallet_ledger
    WHERE idempotency_key = p_idempotency_key;
    IF v_ledger_id IS NOT NULL THEN
      RETURN v_ledger_id;
    END IF;
  END IF;

  SELECT available_balance, pending_balance, hold_balance, reserve_balance, version, status
  INTO v_current_avail, v_current_pending, v_current_hold, v_current_reserve, v_version, v_status
  FROM public.merchant_wallet
  WHERE id = p_wallet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found: %', p_wallet_id;
  END IF;

  IF v_status IN ('FROZEN', 'BLOCKED', 'SUSPENDED') THEN
    RAISE EXCEPTION 'wallet not allowed to debit: status = %', v_status;
  END IF;

  CASE p_balance_type
    WHEN 'AVAILABLE' THEN
      IF v_current_avail < p_amount THEN
        RAISE EXCEPTION 'insufficient available balance: have %, need %', v_current_avail, p_amount;
      END IF;
      v_balance_after := v_current_avail - p_amount;
      v_current_avail := v_balance_after;
    WHEN 'PENDING' THEN
      IF v_current_pending < p_amount THEN
        RAISE EXCEPTION 'insufficient pending balance';
      END IF;
      v_balance_after := v_current_pending - p_amount;
      v_current_pending := v_balance_after;
    WHEN 'HOLD' THEN
      IF v_current_hold < p_amount THEN
        RAISE EXCEPTION 'insufficient hold balance';
      END IF;
      v_balance_after := v_current_hold - p_amount;
      v_current_hold := v_balance_after;
    WHEN 'RESERVE' THEN
      IF v_current_reserve < p_amount THEN
        RAISE EXCEPTION 'insufficient reserve balance';
      END IF;
      v_balance_after := v_current_reserve - p_amount;
      v_current_reserve := v_balance_after;
    ELSE
      RAISE EXCEPTION 'invalid balance_type %', p_balance_type;
  END CASE;

  INSERT INTO public.merchant_wallet_ledger (
    wallet_id, direction, category, balance_type, amount, balance_after,
    reference_type, reference_id, idempotency_key, description, metadata
  ) VALUES (
    p_wallet_id, 'DEBIT', p_category, p_balance_type, p_amount, v_balance_after,
    p_reference_type, p_reference_id, p_idempotency_key, p_description, p_metadata
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.merchant_wallet
  SET
    available_balance = v_current_avail,
    pending_balance = v_current_pending,
    hold_balance = v_current_hold,
    reserve_balance = v_current_reserve,
    total_withdrawn = total_withdrawn + CASE WHEN p_category = 'WITHDRAWAL' THEN p_amount ELSE 0 END,
    total_penalty = total_penalty + CASE WHEN p_category = 'PENALTY' THEN p_amount ELSE 0 END,
    total_commission_deducted = total_commission_deducted + CASE WHEN p_category = 'COMMISSION_DEDUCTION' THEN p_amount ELSE 0 END,
    version = version + 1,
    updated_at = NOW()
  WHERE id = p_wallet_id AND version = v_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet version conflict; retry';
  END IF;

  INSERT INTO public.merchant_wallet_transactions (
    wallet_id, ledger_id, direction, category, amount,
    reference_type, reference_id, idempotency_key, description, metadata
  ) VALUES (
    p_wallet_id, v_ledger_id, 'DEBIT', p_category, p_amount,
    p_reference_type, p_reference_id, p_idempotency_key, p_description, p_metadata
  );

  RETURN v_ledger_id;
END;
$$;

-- ============================================================================
-- TRIGGER: Update merchant_wallet.updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_merchant_wallet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS merchant_wallet_updated_at_trigger ON public.merchant_wallet;
CREATE TRIGGER merchant_wallet_updated_at_trigger
  BEFORE UPDATE ON public.merchant_wallet
  FOR EACH ROW
  EXECUTE FUNCTION update_merchant_wallet_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (optional; enable and add policies as needed)
-- ============================================================================

ALTER TABLE public.merchant_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_settlement_breakdown ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_penalties ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SAMPLE FLOW: Order settlement (credit merchant_net after DELIVERED)
-- Run this when order status becomes 'delivered'. Uses idempotency_key.
-- ============================================================================
-- Step 1: Ensure order_settlement_breakdown exists for the order (e.g. from bill generation).
--   INSERT INTO order_settlement_breakdown (order_id, item_total, packaging_charge, merchant_funded_discount, merchant_gross, commission_percentage, commission_amount, merchant_net)
--   SELECT ...
--   ON CONFLICT (order_id) DO NOTHING;
-- Step 2: On DELIVERED, credit wallet with merchant_net (Option A: to AVAILABLE; Option B: to PENDING then move T+1).
--   SELECT public.merchant_wallet_credit(
--     (SELECT w.id FROM merchant_wallet w JOIN orders o ON o.merchant_store_id = w.merchant_store_id WHERE o.id = :order_id),
--     (SELECT merchant_net FROM order_settlement_breakdown WHERE order_id = :order_id),
--     'ORDER_EARNING'::wallet_transaction_category,
--     'AVAILABLE'::wallet_balance_type,
--     'ORDER'::wallet_reference_type,
--     :order_id,
--     'order_settle_' || :order_id,
--     'Order earning'
--   );
-- Step 3: Mark breakdown settled and link ledger_id (from return value of merchant_wallet_credit).
--   UPDATE order_settlement_breakdown SET settled = TRUE, settled_at = NOW(), ledger_id = :ledger_id, wallet_id = :wallet_id WHERE order_id = :order_id;

-- ============================================================================
-- SAMPLE FLOW: Penalty (DEBIT; do not modify balance directly)
-- ============================================================================
--   ledger_id := public.merchant_wallet_debit(
--     :wallet_id,
--     :penalty_amount,
--     'PENALTY'::wallet_transaction_category,
--     'AVAILABLE'::wallet_balance_type,
--     'ORDER'::wallet_reference_type,
--     :order_id,
--     'penalty_' || :order_id || '_' || :reason_code,
--     'Late accept penalty',
--     '{"reason":"LATE_ACCEPT"}'::jsonb
--   );
--   INSERT INTO merchant_penalties (wallet_id, amount, reason, penalty_type, reference_type, reference_id, ledger_id, status)
--   VALUES (:wallet_id, :penalty_amount, 'Late accept', 'LATE_ACCEPT', 'ORDER', :order_id, ledger_id, 'APPLIED');

-- ============================================================================
-- SAMPLE FLOW: Withdrawal (hold on request, then debit on completion + commission)
-- ============================================================================
-- 1. Create payout request (status PENDING). Optionally move amount to HOLD via credit(HOLD) + debit(AVAILABLE) or use single debit at approval.
-- 2. On approval: debit AVAILABLE for (amount + commission), record COMMISSION_DEDUCTION ledger entry, then WITHDRAWAL ledger entry (or one WITHDRAWAL with net and store commission in metadata).
--    Recommended: one DEBIT WITHDRAWAL for net_payout_amount, one DEBIT COMMISSION_DEDUCTION for commission_amount (both from AVAILABLE).
-- 3. Update merchant_payout_requests with debit_ledger_id, status = COMPLETED, completed_at = NOW().
