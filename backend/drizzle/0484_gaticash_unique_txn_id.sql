-- ─────────────────────────────────────────────────────────────────────────────
-- 0484 · Unique GatiCash payment transaction IDs (GC-{UUID})
--
-- Replaces predictable `gaticash_<orderId>` / `order_gaticash_<orderId>` keys with
-- globally unique payment transaction references suitable for audit / support.
--
-- • New payments mint GC-{UUID} at finalize and store it on:
--     orders_core_payments.transaction_id  (100% GatiCash)
--     orders_core_payments.gateway_response.gatiCashTxnId  (mixed / always)
--     customer_wallet_transactions.transaction_id  (wallet debit key)
-- • Refunds store original_gati_cash_txn_id pointing at that payment txn.
-- Additive / idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.order_refunds
  ADD COLUMN IF NOT EXISTS original_gati_cash_txn_id TEXT;

CREATE INDEX IF NOT EXISTS order_refunds_original_gati_cash_txn_id_idx
  ON public.order_refunds (original_gati_cash_txn_id)
  WHERE original_gati_cash_txn_id IS NOT NULL AND TRIM(original_gati_cash_txn_id) <> '';

COMMENT ON COLUMN public.order_refunds.original_gati_cash_txn_id IS
  'Original GatiCash payment transaction id (GC-{UUID}) this refund restores against.';

-- Lookup index for modern GatiCash txn ids (not a global UNIQUE — razorpay ids
-- may already be duplicated in legacy data).
CREATE INDEX IF NOT EXISTS orders_core_payments_gati_txn_idx
  ON public.orders_core_payments (transaction_id)
  WHERE transaction_id ILIKE 'GC-%';

-- ── Backfill legacy 100% GatiCash payment rows ───────────────────────────────
DO $$
DECLARE
  r RECORD;
  v_new TEXT;
  v_legacy_wallet TEXT;
BEGIN
  FOR r IN
    SELECT
      p.id AS payment_id,
      p.order_id,
      p.transaction_id AS old_txn,
      p.gateway_response
    FROM public.orders_core_payments p
    WHERE LOWER(COALESCE(p.payment_gateway, '')) IN ('gati_cash', 'wallet')
      AND p.transaction_id IS NOT NULL
      AND (
        p.transaction_id ILIKE 'gaticash_%'
        OR p.transaction_id ILIKE 'order_gaticash_%'
      )
  LOOP
    v_new := NULLIF(TRIM(COALESCE(r.gateway_response ->> 'gatiCashTxnId', '')), '');
    IF v_new IS NULL OR v_new !~* '^GC-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$' THEN
      v_new := 'GC-' || UPPER(gen_random_uuid()::text);
    END IF;

    v_legacy_wallet := 'order_gaticash_' || COALESCE(r.order_id, '');

    IF EXISTS (
      SELECT 1 FROM public.orders_core_payments x
      WHERE x.transaction_id = v_new AND x.id <> r.payment_id
    ) THEN
      v_new := 'GC-' || UPPER(gen_random_uuid()::text);
    END IF;

    UPDATE public.orders_core_payments
    SET
      transaction_id = v_new,
      gateway_response = COALESCE(gateway_response, '{}'::jsonb)
        || jsonb_build_object(
          'gatiCashTxnId', v_new,
          'legacyGatiCashTxnId', r.old_txn,
          'settledBy', COALESCE(gateway_response ->> 'settledBy', 'gati_cash_wallet')
        )
    WHERE id = r.payment_id;

    UPDATE public.customer_wallet_transactions
    SET
      transaction_id = v_new,
      transaction_metadata = COALESCE(transaction_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'gatiCashTxnId', v_new,
          'legacyTransactionId', transaction_id
        )
    WHERE transaction_id = v_legacy_wallet
       OR transaction_id = r.old_txn;
  END LOOP;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
  WHEN undefined_column THEN
    -- Older schemas may use `metadata` instead of `transaction_metadata`.
    RAISE NOTICE '0484 gaticash payment backfill: column mismatch — %', SQLERRM;
END $$;

-- Mixed / razorpay+wallet: stamp gatiCashTxnId and rewrite legacy wallet debit keys.
DO $$
DECLARE
  r RECORD;
  v_new TEXT;
  v_legacy_wallet TEXT;
  v_gati_used NUMERIC;
BEGIN
  FOR r IN
    SELECT
      p.id AS payment_id,
      p.order_id,
      p.gateway_response
    FROM public.orders_core_payments p
    WHERE LOWER(COALESCE(p.payment_gateway, '')) IN ('mixed', 'razorpay')
      AND EXISTS (
        SELECT 1 FROM public.customer_wallet_transactions w
        WHERE w.transaction_id = ('order_gaticash_' || p.order_id)
      )
  LOOP
    v_gati_used := COALESCE(
      NULLIF(TRIM(COALESCE(r.gateway_response #>> '{breakdown,gatiCashUsed}', '')), '')::numeric,
      NULLIF(TRIM(COALESCE(r.gateway_response ->> 'gatiCashUsed', '')), '')::numeric,
      0
    );

    IF v_gati_used <= 0.005
       AND NULLIF(TRIM(COALESCE(r.gateway_response ->> 'gatiCashTxnId', '')), '') IS NULL
       AND NULLIF(TRIM(COALESCE(r.gateway_response #>> '{breakdown,gatiCashTxnId}', '')), '') IS NULL
    THEN
      CONTINUE;
    END IF;

    v_new := NULLIF(TRIM(COALESCE(r.gateway_response ->> 'gatiCashTxnId', '')), '');
    IF v_new IS NULL THEN
      v_new := NULLIF(TRIM(COALESCE(r.gateway_response #>> '{breakdown,gatiCashTxnId}', '')), '');
    END IF;
    IF v_new IS NULL OR v_new !~* '^GC-[0-9A-F]{8}-' THEN
      v_new := 'GC-' || UPPER(gen_random_uuid()::text);
    END IF;

    v_legacy_wallet := 'order_gaticash_' || COALESCE(r.order_id, '');

    UPDATE public.orders_core_payments
    SET gateway_response = COALESCE(gateway_response, '{}'::jsonb)
      || jsonb_build_object('gatiCashTxnId', v_new)
    WHERE id = r.payment_id;

    UPDATE public.customer_wallet_transactions
    SET
      transaction_id = v_new,
      transaction_metadata = COALESCE(transaction_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'gatiCashTxnId', v_new,
          'legacyTransactionId', transaction_id
        )
    WHERE transaction_id = v_legacy_wallet;
  END LOOP;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
  WHEN others THEN
    RAISE NOTICE '0484 mixed gaticash backfill skipped: %', SQLERRM;
END $$;

-- Point wallet refunds at the original GatiCash payment txn for traceability.
UPDATE public.order_refunds r
SET original_gati_cash_txn_id = COALESCE(
  NULLIF(TRIM(r.original_gati_cash_txn_id), ''),
  CASE
    WHEN p.transaction_id ILIKE 'GC-%' THEN NULLIF(TRIM(p.transaction_id), '')
    ELSE NULL
  END,
  NULLIF(TRIM(p.gateway_response ->> 'gatiCashTxnId'), ''),
  NULLIF(TRIM(p.gateway_response #>> '{breakdown,gatiCashTxnId}'), '')
)
FROM public.orders_core c
JOIN public.orders_core_payments p
  ON p.order_id = c.order_id
WHERE r.order_id = c.id
  AND (
    r.original_gati_cash_txn_id IS NULL
    OR TRIM(COALESCE(r.original_gati_cash_txn_id, '')) = ''
  )
  AND (
    LOWER(COALESCE(p.payment_gateway, '')) IN ('gati_cash', 'wallet', 'mixed')
    OR NULLIF(TRIM(COALESCE(p.gateway_response ->> 'gatiCashTxnId', '')), '') IS NOT NULL
    OR p.transaction_id ILIKE 'GC-%'
  );
