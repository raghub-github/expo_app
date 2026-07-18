-- ─────────────────────────────────────────────────────────────────────────────
-- 0422 · order_refunds: execution routing + actor identity + audit enrichment
--
-- The existing `order_refunds` table records WHAT should be refunded (amount,
-- reason, fault, merchant debit) but not HOW the money actually moved back to
-- the customer, WHO initiated it, or FROM WHERE. This migration adds:
--
--   1. EXECUTION ROUTING
--        Which payment source the refund was routed to (RAZORPAY / WALLET /
--        COD_NOOP / MIXED), along with the concrete gateway/ledger references
--        the executor produced. Also a stable idempotency key so double-clicks
--        or webhook re-deliveries cannot double-refund.
--
--   2. ACTOR IDENTITY (denormalized)
--        Email, name, IP, user agent captured at write time — historical
--        rows survive agent user renames / deletions and admin audit UI
--        doesn't need to join system_users.
--
--   3. PAYMENT SNAPSHOT
--        The original payment gateway/method captured at refund time so a
--        later `orders_core_payments` mutation doesn't rewrite history.
--
-- All new columns are NULLABLE — the migration is additive and does not touch
-- existing rows. Backend code populates the new columns going forward.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.order_refunds
  -- ── Execution routing / gateway result ─────────────────────────────────
  ADD COLUMN IF NOT EXISTS execution_status        TEXT,        -- INITIATED | PROCESSING | COMPLETED | FAILED | NOOP
  ADD COLUMN IF NOT EXISTS execution_route         TEXT,        -- RAZORPAY | WALLET | COD_NOOP | MIXED
  ADD COLUMN IF NOT EXISTS execution_key           TEXT,        -- idempotency
  ADD COLUMN IF NOT EXISTS executed_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_reason          TEXT,

  -- Razorpay result artifacts (populated when execution_route in
  -- ('RAZORPAY','MIXED') and the Razorpay refund API returned success).
  ADD COLUMN IF NOT EXISTS razorpay_refund_id      TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id     TEXT,        -- from orders_core_payments
  ADD COLUMN IF NOT EXISTS razorpay_response       JSONB,

  -- Wallet result artifacts (populated when execution_route in
  -- ('WALLET','MIXED')). customer_wallet_ledger_id points into the
  -- customer wallet ledger row created by the executor.
  ADD COLUMN IF NOT EXISTS customer_wallet_ledger_id BIGINT,
  ADD COLUMN IF NOT EXISTS customer_wallet_amount    NUMERIC(12,2),

  -- For MIXED routing (part gateway, part wallet), the executor may split
  -- the refund. Both artifacts above are populated; these two columns record
  -- the split proportion so reports can reconstruct it without JSON parsing.
  ADD COLUMN IF NOT EXISTS split_razorpay_amount   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS split_wallet_amount     NUMERIC(12,2),

  -- ── Actor identity (denorm at write time) ──────────────────────────────
  ADD COLUMN IF NOT EXISTS actor_email             TEXT,
  ADD COLUMN IF NOT EXISTS actor_name              TEXT,
  ADD COLUMN IF NOT EXISTS actor_role              TEXT,
  ADD COLUMN IF NOT EXISTS actor_ip                INET,
  ADD COLUMN IF NOT EXISTS actor_user_agent        TEXT,

  -- ── Payment snapshot (guard against later mutations) ───────────────────
  ADD COLUMN IF NOT EXISTS payment_gateway_snapshot TEXT,       -- razorpay | wallet | cod | ...
  ADD COLUMN IF NOT EXISTS payment_method_snapshot  TEXT,       -- upi | card | netbanking | wallet | cash | ...
  ADD COLUMN IF NOT EXISTS order_gross_snapshot     NUMERIC(12,2);

-- Enforce execution status enum-lite via CHECK. Allow NULL for legacy rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_refunds_execution_status_check'
  ) THEN
    ALTER TABLE public.order_refunds
      ADD CONSTRAINT order_refunds_execution_status_check
      CHECK (execution_status IS NULL OR execution_status IN (
        'INITIATED','PROCESSING','COMPLETED','FAILED','NOOP'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_refunds_execution_route_check'
  ) THEN
    ALTER TABLE public.order_refunds
      ADD CONSTRAINT order_refunds_execution_route_check
      CHECK (execution_route IS NULL OR execution_route IN (
        'RAZORPAY','WALLET','COD_NOOP','MIXED'
      ));
  END IF;
END $$;

-- Idempotency: a single UNIQUE key per completed / in-flight execution.
-- Partial index so that legacy rows (execution_key IS NULL) don't clash.
CREATE UNIQUE INDEX IF NOT EXISTS order_refunds_execution_key_uniq
  ON public.order_refunds (execution_key)
  WHERE execution_key IS NOT NULL;

-- Fast admin lookups: "show me all completed razorpay refunds this month"
CREATE INDEX IF NOT EXISTS order_refunds_execution_status_idx
  ON public.order_refunds (execution_status, executed_at DESC)
  WHERE execution_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_refunds_razorpay_refund_id_idx
  ON public.order_refunds (razorpay_refund_id)
  WHERE razorpay_refund_id IS NOT NULL;

-- Actor audit report: "which agent processed the most refunds this week"
CREATE INDEX IF NOT EXISTS order_refunds_actor_idx
  ON public.order_refunds (refund_initiated_by_id, created_at DESC)
  WHERE refund_initiated_by_id IS NOT NULL;

COMMENT ON COLUMN public.order_refunds.execution_status IS
  'Where the refund is in its lifecycle. INITIATED right after row insert; PROCESSING after Razorpay API accepted; COMPLETED after webhook confirms (razorpay) or immediately (wallet/noop); FAILED on error.';
COMMENT ON COLUMN public.order_refunds.execution_route IS
  'Which payment source the refund was routed to. Derived server-side from the original order_payments row.';
COMMENT ON COLUMN public.order_refunds.execution_key IS
  'Idempotency key: sha256(order_id + refund_id) — a re-submit or webhook re-delivery cannot double-refund.';
COMMENT ON COLUMN public.order_refunds.payment_gateway_snapshot IS
  'Snapshot of the original payment gateway at refund time. Prevents ledger drift if orders_core_payments is later mutated.';
