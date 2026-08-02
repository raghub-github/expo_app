-- ─────────────────────────────────────────────────────────────────────────────
-- 0483 · order_refunds: customer-facing refund capture (source split + RRN)
--
-- Ensures every refund permanently records:
--   • original wallet vs gateway amounts (source of truth for restoration)
--   • a stable customer-facing refund_reference (RRN)
--   • initiated_at + timeline JSON for the order-details refund card
-- Additive / idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.order_refunds
  ADD COLUMN IF NOT EXISTS original_gati_cash_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS original_gateway_amount   NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS refund_reference          TEXT,
  ADD COLUMN IF NOT EXISTS initiated_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_timeline           JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Unique-ish lookup for support / copy-RRN (NULLs allowed for legacy).
CREATE UNIQUE INDEX IF NOT EXISTS order_refunds_refund_reference_uniq
  ON public.order_refunds (refund_reference)
  WHERE refund_reference IS NOT NULL AND TRIM(refund_reference) <> '';

CREATE INDEX IF NOT EXISTS order_refunds_initiated_at_idx
  ON public.order_refunds (initiated_at DESC NULLS LAST)
  WHERE initiated_at IS NOT NULL;

COMMENT ON COLUMN public.order_refunds.original_gati_cash_amount IS
  'GatiCash (wallet) portion of the original payment that this refund must restore.';
COMMENT ON COLUMN public.order_refunds.original_gateway_amount IS
  'Gateway (UPI/card/netbanking) portion of the original payment that this refund must restore.';
COMMENT ON COLUMN public.order_refunds.refund_reference IS
  'Customer-facing refund reference (RRN). Prefer Razorpay rfnd_*, else WALLET-{ledger}, else RFND-{id}.';
COMMENT ON COLUMN public.order_refunds.initiated_at IS
  'When refund execution was initiated (INITIATED stamp).';
COMMENT ON COLUMN public.order_refunds.refund_timeline IS
  'JSON array of {key,label,at} steps for customer refund card (initiated/processed/completed).';

-- Backfill references + initiated_at from existing execution artifacts.
UPDATE public.order_refunds
SET
  refund_reference = COALESCE(
    NULLIF(TRIM(refund_reference), ''),
    NULLIF(TRIM(razorpay_refund_id), ''),
    NULLIF(TRIM(pg_refund_id), ''),
    CASE
      WHEN customer_wallet_ledger_id IS NOT NULL
        THEN 'WALLET-' || customer_wallet_ledger_id::text
      ELSE 'RFND-' || id::text
    END
  ),
  initiated_at = COALESCE(initiated_at, executed_at, created_at),
  original_gati_cash_amount = COALESCE(
    original_gati_cash_amount,
    split_wallet_amount,
    customer_wallet_amount
  ),
  original_gateway_amount = COALESCE(
    original_gateway_amount,
    split_razorpay_amount
  )
WHERE refund_reference IS NULL
   OR TRIM(COALESCE(refund_reference, '')) = ''
   OR initiated_at IS NULL
   OR (original_gati_cash_amount IS NULL AND COALESCE(split_wallet_amount, customer_wallet_amount) IS NOT NULL)
   OR (original_gateway_amount IS NULL AND split_razorpay_amount IS NOT NULL);

-- Seed a minimal timeline for completed/processing rows that have none.
UPDATE public.order_refunds
SET refund_timeline = jsonb_build_array(
  jsonb_build_object(
    'key', 'initiated',
    'label', 'Refund initiated',
    'at', COALESCE(initiated_at, created_at)
  ),
  jsonb_build_object(
    'key', 'processed',
    'label', 'Refund processed',
    'at', COALESCE(executed_at, initiated_at, created_at)
  ),
  jsonb_build_object(
    'key', 'completed',
    'label', 'Refund completed',
    'at', COALESCE(completed_at, executed_at, initiated_at, created_at)
  )
)
WHERE (
    UPPER(COALESCE(execution_status, '')) IN ('COMPLETED', 'PROCESSING', 'NOOP')
    OR LOWER(COALESCE(refund_status, '')) IN ('completed', 'processing', 'refunded')
  )
  AND (
    refund_timeline IS NULL
    OR refund_timeline = '[]'::jsonb
    OR jsonb_typeof(refund_timeline) <> 'array'
  );
