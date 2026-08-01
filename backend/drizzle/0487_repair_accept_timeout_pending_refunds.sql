-- ─────────────────────────────────────────────────────────────────────────────
-- 0487 · Repair MERCHANT_ACCEPT_TIMEOUT refunds stuck at Pending RRN
--
-- Symptom: order CANCELLED (Auto Cancelled — MERCHANT_ACCEPT_TIMEOUT) but
-- Payment Details shows Pending RRN / Status Pending / Total refunded ₹0 while
-- Rejection Info shows REFUND PENDING.
--
-- Cause: prepaid wallet / PaymentMode=Online checkouts were routed as Razorpay
-- without a pay_* capture, or execution stopped at INITIATED. Money never moved.
--
-- This migration:
--   1) Credits GatiCash for hollow accept-timeout refund rows (idempotent key)
--   2) Mints RRN-{UUID}, marks COMPLETED / WALLET
--   3) Syncs order_cancellation_reasons + orders_core.payment_status/total_refunded
--   4) Creates + settles a refund when the cancel left only refund INTENT
-- Additive / idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Some environments never got 0008's total_refunded column; add if missing so
-- repair updates don't abort the whole DO block via undefined_column.
ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS total_refunded NUMERIC(12, 2) DEFAULT 0;

DO $$
DECLARE
  r RECORD;
  v_ledger BIGINT;
  v_rrn TEXT;
  v_amount NUMERIC(12, 2);
  v_customer BIGINT;
  v_order_text TEXT;
  v_new_refund_id BIGINT;
  v_paid NUMERIC(12, 2);
  v_has_total_refunded BOOLEAN := TRUE;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders_core'
      AND column_name = 'total_refunded'
  ) INTO v_has_total_refunded;
  -- ── A) Settle existing hollow order_refunds on accept-timeout cancels ──────
  FOR r IN
    SELECT
      rf.id AS refund_id,
      rf.order_id AS core_id,
      ROUND(COALESCE(rf.refund_amount, 0)::numeric, 2) AS refund_amount,
      COALESCE(NULLIF(TRIM(rf.refund_reason), ''), 'Auto Cancelled — MERCHANT_ACCEPT_TIMEOUT') AS refund_reason,
      c.customer_id,
      c.order_id AS order_id_text,
      NULLIF(TRIM(rf.refund_reference), '') AS existing_rrn
    FROM public.order_refunds rf
    JOIN public.orders_core c ON c.id = rf.order_id
    JOIN public.orders_food f ON f.order_id = c.id
    WHERE UPPER(COALESCE(f.order_status, '')) = 'CANCELLED'
      AND (
        UPPER(COALESCE(f.rejected_reason, '')) = 'MERCHANT_ACCEPT_TIMEOUT'
        OR UPPER(COALESCE(f.cancelled_by_label, '')) = 'AUTO CANCELLED'
        OR UPPER(COALESCE(f.cancellation_details->>'reason_code', '')) = 'MERCHANT_ACCEPT_TIMEOUT'
      )
      AND COALESCE(rf.refund_amount, 0) > 0.005
      AND rf.customer_wallet_ledger_id IS NULL
      AND NULLIF(TRIM(COALESCE(rf.razorpay_refund_id, '')), '') IS NULL
      AND LOWER(COALESCE(rf.refund_status, '')) NOT IN ('cancelled', 'rejected')
      AND (
        LOWER(COALESCE(rf.refund_status, '')) IN ('pending', 'processing', 'initiated', 'completed', 'refunded', 'failed')
        OR NULLIF(TRIM(COALESCE(rf.execution_status, '')), '') IS NULL
        OR UPPER(COALESCE(rf.execution_status, '')) IN (
          'INITIATED', 'PROCESSING', 'NOOP', 'COMPLETED', 'FAILED'
        )
      )
      -- Do not force-wallet a real Razorpay capture (pay_*).
      AND NOT EXISTS (
        SELECT 1
        FROM public.orders_core_payments op
        WHERE op.order_id = c.order_id
          AND UPPER(COALESCE(op.payment_status, '')) IN ('PAID', 'CAPTURED', 'SUCCESS', 'COMPLETED')
          AND TRIM(COALESCE(op.transaction_id, '')) ~ '^pay_'
      )
      AND c.customer_id IS NOT NULL
  LOOP
    v_amount := r.refund_amount;
    v_customer := r.customer_id;
    v_order_text := COALESCE(r.order_id_text, 'core_' || r.core_id::text);

    BEGIN
      v_ledger := public.customer_wallet_credit(
        v_customer,
        v_amount,
        'REFUND'::public.wallet_transaction_type,
        v_order_text,
        'order_refund',
        'GatiCash Refunded - Credit Wallet',
        NULL,
        'order_refund_' || r.refund_id::text,
        jsonb_build_object(
          'refund_id', r.refund_id,
          'repair_migration', '0487',
          'refund_reason', r.refund_reason
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE '0487 wallet credit failed refund_id=%: %', r.refund_id, SQLERRM;
        CONTINUE;
    END;

    IF v_ledger IS NULL THEN
      RAISE NOTICE '0487 wallet credit returned null refund_id=%', r.refund_id;
      CONTINUE;
    END IF;

    IF r.existing_rrn ~* '^RRN-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$' THEN
      v_rrn := UPPER(r.existing_rrn);
    ELSE
      LOOP
        v_rrn := 'RRN-' || UPPER(gen_random_uuid()::text);
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM public.order_refunds x
          WHERE x.refund_reference = v_rrn AND x.id <> r.refund_id
        );
      END LOOP;
    END IF;

    UPDATE public.order_refunds
    SET execution_status = 'COMPLETED',
        execution_route = 'WALLET',
        execution_key = COALESCE(
          execution_key,
          '0487_repair_' || r.refund_id::text
        ),
        executed_at = COALESCE(executed_at, NOW()),
        completed_at = COALESCE(completed_at, NOW()),
        initiated_at = COALESCE(initiated_at, NOW()),
        customer_wallet_ledger_id = v_ledger,
        customer_wallet_amount = v_amount,
        split_wallet_amount = v_amount,
        split_razorpay_amount = 0,
        refund_status = 'completed',
        refund_reference = v_rrn,
        failure_reason = NULL,
        failed_at = NULL,
        original_gati_cash_amount = COALESCE(original_gati_cash_amount, v_amount),
        original_gateway_amount = COALESCE(original_gateway_amount, 0),
        refund_timeline = COALESCE(
          NULLIF(refund_timeline, '[]'::jsonb),
          jsonb_build_array(
            jsonb_build_object(
              'key', 'initiated',
              'label', format('Refund initiated for ₹%s', to_char(v_amount, 'FM999999990.00')),
              'at', NOW()
            ),
            jsonb_build_object('key', 'processed', 'label', 'Refund processed', 'at', NOW()),
            jsonb_build_object('key', 'completed', 'label', 'Refund completed', 'at', NOW())
          )
        )
    WHERE id = r.refund_id;

    BEGIN
      UPDATE public.order_cancellation_reasons
      SET refund_status = 'completed',
          refund_amount = COALESCE(refund_amount, v_amount),
          updated_at = NOW()
      WHERE order_id = r.core_id
        AND id = (
          SELECT id FROM public.order_cancellation_reasons
          WHERE order_id = r.core_id
          ORDER BY created_at DESC
          LIMIT 1
        );
    EXCEPTION
      WHEN undefined_column THEN
        UPDATE public.order_cancellation_reasons
        SET refund_status = 'completed',
            refund_amount = COALESCE(refund_amount, v_amount)
        WHERE order_id = r.core_id
          AND id = (
            SELECT id FROM public.order_cancellation_reasons
            WHERE order_id = r.core_id
            ORDER BY created_at DESC
            LIMIT 1
          );
    END;

    BEGIN
      IF v_has_total_refunded THEN
        UPDATE public.orders_core
        SET payment_status = 'refunded',
            total_refunded = COALESCE((
              SELECT ROUND(SUM(COALESCE(x.refund_amount, 0))::numeric, 2)
              FROM public.order_refunds x
              WHERE x.order_id = r.core_id
                AND LOWER(COALESCE(x.refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
                AND (
                  x.customer_wallet_ledger_id IS NOT NULL
                  OR NULLIF(TRIM(COALESCE(x.razorpay_refund_id, '')), '') IS NOT NULL
                  OR UPPER(COALESCE(x.execution_status, '')) IN ('COMPLETED', 'PROCESSING', 'NOOP')
                )
            ), v_amount),
            updated_at = NOW()
        WHERE id = r.core_id;
      ELSE
        UPDATE public.orders_core
        SET payment_status = 'refunded',
            updated_at = NOW()
        WHERE id = r.core_id;
      END IF;
    EXCEPTION
      WHEN undefined_column THEN
        UPDATE public.orders_core
        SET payment_status = 'refunded'
        WHERE id = r.core_id;
    END;
  END LOOP;

  -- ── B) Accept-timeout cancels with INTENT only (no order_refunds row) ──────
  FOR r IN
    SELECT
      c.id AS core_id,
      c.customer_id,
      c.order_id AS order_id_text,
      ROUND(
        COALESCE(
          (
            SELECT op.amount
            FROM public.orders_core_payments op
            WHERE op.order_id = c.order_id
              AND UPPER(COALESCE(op.payment_status, '')) IN ('PAID', 'CAPTURED', 'SUCCESS', 'COMPLETED')
              AND NOT (TRIM(COALESCE(op.transaction_id, '')) ~ '^pay_')
            ORDER BY op.paid_at DESC NULLS LAST, op.id DESC
            LIMIT 1
          ),
          (
            SELECT ocr.refund_amount
            FROM public.order_cancellation_reasons ocr
            WHERE ocr.order_id = c.id
            ORDER BY ocr.created_at DESC
            LIMIT 1
          ),
          c.grand_total,
          0
        )::numeric,
        2
      ) AS paid_amount
    FROM public.orders_food f
    JOIN public.orders_core c ON c.id = f.order_id
    WHERE UPPER(COALESCE(f.order_status, '')) = 'CANCELLED'
      AND f.cancelled_at IS NOT NULL
      AND f.cancelled_at > NOW() - INTERVAL '90 days'
      AND (
        UPPER(COALESCE(f.rejected_reason, '')) = 'MERCHANT_ACCEPT_TIMEOUT'
        OR UPPER(COALESCE(f.cancelled_by_label, '')) = 'AUTO CANCELLED'
        OR UPPER(COALESCE(f.cancellation_details->>'reason_code', '')) = 'MERCHANT_ACCEPT_TIMEOUT'
      )
      AND c.customer_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.order_refunds rf
        WHERE rf.order_id = c.id
          AND LOWER(COALESCE(rf.refund_status, '')) NOT IN ('cancelled', 'rejected')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.orders_core_payments op
        WHERE op.order_id = c.order_id
          AND UPPER(COALESCE(op.payment_status, '')) IN ('PAID', 'CAPTURED', 'SUCCESS', 'COMPLETED')
          AND TRIM(COALESCE(op.transaction_id, '')) ~ '^pay_'
      )
  LOOP
    v_paid := COALESCE(r.paid_amount, 0);
    IF v_paid <= 0.005 THEN
      CONTINUE;
    END IF;

    LOOP
      v_rrn := 'RRN-' || UPPER(gen_random_uuid()::text);
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.order_refunds x WHERE x.refund_reference = v_rrn
      );
    END LOOP;

    INSERT INTO public.order_refunds (
      order_id, refund_type, refund_reason, refund_amount,
      refund_fee, net_refund_amount, product_type,
      refund_status, refund_initiated_by, refund_reference,
      initiated_at
    ) VALUES (
      r.core_id, 'full'::refund_type,
      'Auto Cancelled — MERCHANT_ACCEPT_TIMEOUT',
      v_paid, 0, v_paid, 'order',
      'pending', 'system', v_rrn, NOW()
    )
    RETURNING id INTO v_new_refund_id;

    BEGIN
      v_ledger := public.customer_wallet_credit(
        r.customer_id,
        v_paid,
        'REFUND'::public.wallet_transaction_type,
        COALESCE(r.order_id_text, 'core_' || r.core_id::text),
        'order_refund',
        'GatiCash Refunded - Credit Wallet',
        NULL,
        'order_refund_' || v_new_refund_id::text,
        jsonb_build_object(
          'refund_id', v_new_refund_id,
          'repair_migration', '0487',
          'refund_reason', 'Auto Cancelled — MERCHANT_ACCEPT_TIMEOUT'
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE '0487 create+credit failed core_id=%: %', r.core_id, SQLERRM;
        CONTINUE;
    END;

    IF v_ledger IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.order_refunds
    SET execution_status = 'COMPLETED',
        execution_route = 'WALLET',
        execution_key = '0487_repair_' || v_new_refund_id::text,
        executed_at = NOW(),
        completed_at = NOW(),
        customer_wallet_ledger_id = v_ledger,
        customer_wallet_amount = v_paid,
        split_wallet_amount = v_paid,
        split_razorpay_amount = 0,
        refund_status = 'completed',
        original_gati_cash_amount = v_paid,
        original_gateway_amount = 0,
        refund_timeline = jsonb_build_array(
          jsonb_build_object(
            'key', 'initiated',
            'label', format('Refund initiated for ₹%s', to_char(v_paid, 'FM999999990.00')),
            'at', NOW()
          ),
          jsonb_build_object('key', 'processed', 'label', 'Refund processed', 'at', NOW()),
          jsonb_build_object('key', 'completed', 'label', 'Refund completed', 'at', NOW())
        )
    WHERE id = v_new_refund_id;

    BEGIN
      UPDATE public.order_cancellation_reasons
      SET refund_status = 'completed',
          refund_amount = COALESCE(refund_amount, v_paid),
          updated_at = NOW()
      WHERE order_id = r.core_id
        AND id = (
          SELECT id FROM public.order_cancellation_reasons
          WHERE order_id = r.core_id
          ORDER BY created_at DESC
          LIMIT 1
        );
    EXCEPTION
      WHEN undefined_column THEN
        UPDATE public.order_cancellation_reasons
        SET refund_status = 'completed',
            refund_amount = COALESCE(refund_amount, v_paid)
        WHERE order_id = r.core_id
          AND id = (
            SELECT id FROM public.order_cancellation_reasons
            WHERE order_id = r.core_id
            ORDER BY created_at DESC
            LIMIT 1
          );
    END;

    BEGIN
      IF v_has_total_refunded THEN
        UPDATE public.orders_core
        SET payment_status = 'refunded',
            total_refunded = v_paid,
            updated_at = NOW()
        WHERE id = r.core_id;
      ELSE
        UPDATE public.orders_core
        SET payment_status = 'refunded',
            updated_at = NOW()
        WHERE id = r.core_id;
      END IF;
    EXCEPTION
      WHEN undefined_column THEN
        UPDATE public.orders_core
        SET payment_status = 'refunded'
        WHERE id = r.core_id;
    END;
  END LOOP;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE '0487 skipped — required table missing: %', SQLERRM;
  WHEN undefined_function THEN
    RAISE NOTICE '0487 skipped — customer_wallet_credit missing: %', SQLERRM;
  WHEN undefined_column THEN
    RAISE NOTICE '0487 skipped — column missing: %', SQLERRM;
END $$;
