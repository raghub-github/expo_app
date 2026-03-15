-- ============================================================================
-- MERCHANT WALLET V2 – INDUSTRY STANDARD (Swiggy/Zomato-style)
-- Aligns existing schema with: net settlement per order, commission per order,
-- TDS/GST per order, locked balance (refund window), no commission at withdrawal.
-- Run AFTER merchant_wallet.sql
-- ============================================================================

-- ============================================================================
-- 1. EXTEND ENUMS (transaction categories for lock/release, TDS, GST, etc.)
--    PostgreSQL requires literal in ADD VALUE; use exception for idempotency.
-- ============================================================================

DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'ORDER_LOCK'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'ORDER_RELEASE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'TDS_DEBIT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'GST_DEBIT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'GST_CREDIT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'WITHDRAWAL_REVERSAL'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'REFUND_DEBIT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'PENALTY_REVERSAL'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'ADJUSTMENT_CREDIT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'ADJUSTMENT_DEBIT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'COMMISSION_DEBIT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'HOLD_LOCK'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'HOLD_RELEASE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'FAILED_SETTLEMENT_REVERSAL'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. MERCHANT_WALLET: Add locked_balance, pending_settlement, lifetime_credit/debit
--    Semantics: available = withdrawable; locked = refund window; pending = T+1
-- ============================================================================

ALTER TABLE public.merchant_wallet
  ADD COLUMN IF NOT EXISTS locked_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_settlement NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_credit NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_debit NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- Allow negative available_balance for penalty (industry: negative balance allowed)
ALTER TABLE public.merchant_wallet
  DROP CONSTRAINT IF EXISTS merchant_wallet_available_balance_check;

ALTER TABLE public.merchant_wallet
  ADD CONSTRAINT merchant_wallet_available_balance_check
  CHECK (available_balance >= -99999999.99);

COMMENT ON COLUMN public.merchant_wallet.locked_balance IS 'Amount in refund window lock; moves to available after lock period.';
COMMENT ON COLUMN public.merchant_wallet.pending_settlement IS 'Earnings not yet released (e.g. T+1/T+3 settlement cycle).';
COMMENT ON COLUMN public.merchant_wallet.lifetime_credit IS 'Total ever credited (audit).';
COMMENT ON COLUMN public.merchant_wallet.lifetime_debit IS 'Total ever debited (audit).';

-- ============================================================================
-- 3. WALLET_BALANCE_TYPE: Add LOCKED if not present
-- ============================================================================

DO $$ BEGIN ALTER TYPE wallet_balance_type ADD VALUE 'LOCKED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 4. ORDER_SETTLEMENT_BREAKDOWN: Add TDS, commission GST, platform coupon; net formula
--    Net Settlement = Merchant Base + GST collected - Commission - Commission GST - TDS
-- ============================================================================

ALTER TABLE public.order_settlement_breakdown
  ADD COLUMN IF NOT EXISTS tds_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_gst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_coupon_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchant_base_after_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_collected NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_window_days INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.order_settlement_breakdown.tds_amount IS 'TDS deducted from merchant (e.g. 1% on base).';
COMMENT ON COLUMN public.order_settlement_breakdown.commission_gst_amount IS 'GST on commission (e.g. 18%) payable by merchant.';
COMMENT ON COLUMN public.order_settlement_breakdown.merchant_net IS 'Net settlement credited to wallet = merchant_base + gst_collected - commission - commission_gst - tds.';
COMMENT ON COLUMN public.order_settlement_breakdown.refund_window_days IS 'Days to keep amount in locked_balance before release to available.';
COMMENT ON COLUMN public.order_settlement_breakdown.locked_until IS 'Timestamp after which locked amount moves to available.';

-- ============================================================================
-- 5. MERCHANT_WALLET_LEDGER: Add balance_before, gst_amount, commission_amount, tds_amount, order_id
-- ============================================================================

ALTER TABLE public.merchant_wallet_ledger
  ADD COLUMN IF NOT EXISTS balance_before NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_amount NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_id BIGINT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED';

CREATE INDEX IF NOT EXISTS merchant_wallet_ledger_order_id_idx
  ON public.merchant_wallet_ledger(order_id) WHERE order_id IS NOT NULL;

COMMENT ON COLUMN public.merchant_wallet_ledger.balance_before IS 'Balance before this entry (audit).';
COMMENT ON COLUMN public.merchant_wallet_ledger.order_id IS 'Order id when reference_type = ORDER.';

-- Ledger: ensure balance_type LOCKED exists for credit_to_locked (enum already extended above)

ALTER TABLE public.merchant_wallet_transactions
  ADD COLUMN IF NOT EXISTS order_id BIGINT;

CREATE INDEX IF NOT EXISTS merchant_wallet_transactions_order_id_idx
  ON public.merchant_wallet_transactions(order_id) WHERE order_id IS NOT NULL;

-- ============================================================================
-- 6. MERCHANT_SETTLEMENT_BATCHES (settlement cycle tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_settlement_batches (
  id BIGSERIAL PRIMARY KEY,
  batch_ref TEXT NOT NULL UNIQUE,
  merchant_store_id BIGINT NOT NULL,
  wallet_id BIGINT NOT NULL,

  settlement_cycle_start DATE NOT NULL,
  settlement_cycle_end DATE NOT NULL,
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_merchant_net NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_commission NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_tds NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_gst_on_commission NUMERIC(14, 2) NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'PENDING',
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT merchant_settlement_batches_merchant_store_id_fkey
    FOREIGN KEY (merchant_store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  CONSTRAINT merchant_settlement_batches_wallet_id_fkey
    FOREIGN KEY (wallet_id) REFERENCES public.merchant_wallet(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS merchant_settlement_batches_merchant_store_id_idx ON public.merchant_settlement_batches(merchant_store_id);
CREATE INDEX IF NOT EXISTS merchant_settlement_batches_cycle_idx ON public.merchant_settlement_batches(settlement_cycle_start, settlement_cycle_end);
CREATE INDEX IF NOT EXISTS merchant_settlement_batches_status_idx ON public.merchant_settlement_batches(status);

COMMENT ON TABLE public.merchant_settlement_batches IS 'Settlement cycle batches for reconciliation and reporting.';

-- ============================================================================
-- 7. MERCHANT_COMMISSION_INVOICES (invoice snapshot per cycle/withdrawal)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_commission_invoices (
  id BIGSERIAL PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  merchant_store_id BIGINT NOT NULL,
  wallet_id BIGINT NOT NULL,

  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_order_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_commission NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_gst_on_commission NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_tds NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_settlement NUMERIC(14, 2) NOT NULL DEFAULT 0,

  payout_request_id BIGINT,
  settlement_batch_id BIGINT,
  invoice_url TEXT,
  status TEXT NOT NULL DEFAULT 'GENERATED',

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT merchant_commission_invoices_merchant_store_id_fkey
    FOREIGN KEY (merchant_store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  CONSTRAINT merchant_commission_invoices_wallet_id_fkey
    FOREIGN KEY (wallet_id) REFERENCES public.merchant_wallet(id) ON DELETE CASCADE,
  CONSTRAINT merchant_commission_invoices_payout_request_id_fkey
    FOREIGN KEY (payout_request_id) REFERENCES public.merchant_payout_requests(id) ON DELETE SET NULL,
  CONSTRAINT merchant_commission_invoices_settlement_batch_id_fkey
    FOREIGN KEY (settlement_batch_id) REFERENCES public.merchant_settlement_batches(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS merchant_commission_invoices_merchant_store_id_idx ON public.merchant_commission_invoices(merchant_store_id);
CREATE INDEX IF NOT EXISTS merchant_commission_invoices_period_idx ON public.merchant_commission_invoices(period_start, period_end);

COMMENT ON TABLE public.merchant_commission_invoices IS 'Commission/invoice snapshot for settlement cycle or withdrawal. Commission is per-order; this is for reporting.';

-- ============================================================================
-- 8. PAYOUT: Commission already deducted per order – payout = debit available only
--    Keep commission_amount in merchant_payout_requests as 0 (or legacy); net_payout_amount = amount
-- ============================================================================

COMMENT ON TABLE public.merchant_payout_requests IS 'Withdrawal: deduct from available_balance only. Commission is NOT deducted at withdrawal (already deducted per order). net_payout_amount = amount requested.';

-- ============================================================================
-- 9. FUNCTION: Credit to LOCKED (order delivered – net settlement, refund window)
--    Call when order status = DELIVERED. Amount = merchant_net from order_settlement_breakdown.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merchant_wallet_credit_to_locked(
  p_wallet_id BIGINT,
  p_amount NUMERIC(14, 2),
  p_order_id BIGINT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_gst_amount NUMERIC(12, 2) DEFAULT 0,
  p_commission_amount NUMERIC(12, 2) DEFAULT 0,
  p_tds_amount NUMERIC(12, 2) DEFAULT 0,
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
  v_locked NUMERIC(14, 2);
  v_version INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_ledger_id FROM public.merchant_wallet_ledger WHERE idempotency_key = p_idempotency_key;
    IF v_ledger_id IS NOT NULL THEN RETURN v_ledger_id; END IF;
  END IF;

  SELECT locked_balance, version INTO v_locked, v_version
  FROM public.merchant_wallet WHERE id = p_wallet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet not found: %', p_wallet_id; END IF;

  v_balance_after := v_locked + p_amount;

  INSERT INTO public.merchant_wallet_ledger (
    wallet_id, direction, category, balance_type, amount, balance_before, balance_after,
    reference_type, reference_id, order_id, idempotency_key, description,
    gst_amount, commission_amount, tds_amount, metadata
  ) VALUES (
    p_wallet_id, 'CREDIT', 'ORDER_EARNING'::wallet_transaction_category, 'LOCKED'::wallet_balance_type,
    p_amount, v_locked, v_balance_after, 'ORDER'::wallet_reference_type, p_order_id, p_order_id,
    p_idempotency_key, COALESCE(p_description, 'Order settlement (locked)'),
    p_gst_amount, p_commission_amount, p_tds_amount, p_metadata
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.merchant_wallet
  SET locked_balance = v_balance_after,
      total_earned = total_earned + p_amount,
      lifetime_credit = lifetime_credit + p_amount,
      version = version + 1,
      updated_at = NOW()
  WHERE id = p_wallet_id AND version = v_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet version conflict; retry'; END IF;

  INSERT INTO public.merchant_wallet_transactions (
    wallet_id, ledger_id, direction, category, amount, reference_type, reference_id, order_id, idempotency_key, description, metadata
  ) VALUES (
    p_wallet_id, v_ledger_id, 'CREDIT', 'ORDER_EARNING'::wallet_transaction_category, p_amount,
    'ORDER'::wallet_reference_type, p_order_id, p_order_id, p_idempotency_key, COALESCE(p_description, 'Order settlement'), p_metadata
  );

  RETURN v_ledger_id;
END;
$$;

COMMENT ON FUNCTION public.merchant_wallet_credit_to_locked IS 'Credits merchant_net to locked_balance when order is DELIVERED. Use merchant_wallet_release_locked after refund window.';

-- ============================================================================
-- 10. FUNCTION: Release locked balance to available (refund window expiry)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merchant_wallet_release_locked(
  p_wallet_id BIGINT,
  p_amount NUMERIC(14, 2),
  p_reference_id BIGINT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ledger_id BIGINT;
  v_balance_after_avail NUMERIC(14, 2);
  v_balance_after_locked NUMERIC(14, 2);
  v_avail NUMERIC(14, 2);
  v_locked NUMERIC(14, 2);
  v_version INTEGER;
  v_cat wallet_transaction_category;
  v_bt wallet_balance_type;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_ledger_id FROM public.merchant_wallet_ledger WHERE idempotency_key = p_idempotency_key;
    IF v_ledger_id IS NOT NULL THEN RETURN v_ledger_id; END IF;
  END IF;

  SELECT available_balance, locked_balance, version
  INTO v_avail, v_locked, v_version
  FROM public.merchant_wallet WHERE id = p_wallet_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'wallet not found: %', p_wallet_id; END IF;
  IF v_locked < p_amount THEN RAISE EXCEPTION 'insufficient locked balance'; END IF;

  v_balance_after_locked := v_locked - p_amount;
  v_balance_after_avail := v_avail + p_amount;

  SELECT 'ORDER_RELEASE'::wallet_transaction_category INTO v_cat;
  SELECT 'LOCKED'::wallet_balance_type INTO v_bt;

  INSERT INTO public.merchant_wallet_ledger (
    wallet_id, direction, category, balance_type, amount, balance_before, balance_after,
    reference_type, reference_id, order_id, idempotency_key, description
  ) VALUES (
    p_wallet_id, 'DEBIT', v_cat, v_bt, p_amount, v_locked, v_balance_after_locked,
    'ORDER'::wallet_reference_type, p_reference_id, p_reference_id, p_idempotency_key, COALESCE(p_description, 'Refund window release')
  )
  RETURNING id INTO v_ledger_id;

  INSERT INTO public.merchant_wallet_ledger (
    wallet_id, direction, category, balance_type, amount, balance_before, balance_after,
    reference_type, reference_id, order_id, idempotency_key, description
  ) VALUES (
    p_wallet_id, 'CREDIT', v_cat, 'AVAILABLE'::wallet_balance_type, p_amount, v_avail, v_balance_after_avail,
    'ORDER'::wallet_reference_type, p_reference_id, p_reference_id, NULL, COALESCE(p_description, 'Refund window release')
  );

  UPDATE public.merchant_wallet
  SET available_balance = v_balance_after_avail,
      locked_balance = v_balance_after_locked,
      version = version + 1,
      updated_at = NOW()
  WHERE id = p_wallet_id AND version = v_version;

  IF NOT FOUND THEN RAISE EXCEPTION 'wallet version conflict; retry'; END IF;

  RETURN v_ledger_id;
END;
$$;

COMMENT ON FUNCTION public.merchant_wallet_release_locked IS 'Moves amount from locked_balance to available_balance after refund window. Call from scheduler.';
