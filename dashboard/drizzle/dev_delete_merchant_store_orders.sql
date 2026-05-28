-- =============================================================================
-- DEV ONLY: Delete all orders + wallet/payment data for one merchant store.
-- =============================================================================
-- Store: set public store_id (e.g. GMMC1025) OR internal merchant_stores.id.
--
-- Run in Supabase SQL editor. Review preview, then COMMIT.
-- Payments-only reset (keeps orders): 0241_dev_reset_merchant_store_payments.sql
-- Also run: 0238_merchant_wallet_order_earning_delivered_only.sql
-- =============================================================================

BEGIN;

DO $$
DECLARE
  p_store_public_id TEXT := 'GMMC1025';
  p_merchant_store_id BIGINT := NULL;
  v_store_id BIGINT;
BEGIN
  IF p_merchant_store_id IS NOT NULL AND p_merchant_store_id > 0 THEN
    v_store_id := p_merchant_store_id;
  ELSIF p_store_public_id IS NOT NULL AND length(trim(p_store_public_id)) > 0 THEN
    SELECT ms.id INTO v_store_id
    FROM public.merchant_stores ms
    WHERE ms.store_id = trim(p_store_public_id) AND ms.deleted_at IS NULL
    LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Set p_store_public_id or p_merchant_store_id';
  END IF;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Store not found: %', p_store_public_id;
  END IF;
  PERFORM set_config('app.dev_delete_store_id', v_store_id::text, true);
END $$;

-- ---------------------------------------------------------------------------
-- Order ids for this store
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS _dev_store_core_ids;
CREATE TEMP TABLE _dev_store_core_ids AS
SELECT DISTINCT c.id AS core_id
FROM public.orders_core c
WHERE c.merchant_store_id = current_setting('app.dev_delete_store_id')::bigint
UNION
SELECT DISTINCT f.order_id AS core_id
FROM public.orders_food f
WHERE f.merchant_store_id = current_setting('app.dev_delete_store_id')::bigint
  AND f.order_id IS NOT NULL;

DROP TABLE IF EXISTS _dev_store_food_ids;
CREATE TEMP TABLE _dev_store_food_ids AS
SELECT f.id AS food_id, f.order_id AS core_id
FROM public.orders_food f
WHERE f.merchant_store_id = current_setting('app.dev_delete_store_id')::bigint
   OR f.order_id IN (SELECT core_id FROM _dev_store_core_ids);

DROP TABLE IF EXISTS _dev_store_wallet_ids;
CREATE TEMP TABLE _dev_store_wallet_ids AS
SELECT w.id AS wallet_id
FROM public.merchant_wallet w
WHERE w.merchant_store_id = current_setting('app.dev_delete_store_id')::bigint;

-- ---------------------------------------------------------------------------
-- Preview
-- ---------------------------------------------------------------------------
SELECT 'orders_core' AS tbl, COUNT(*)::bigint AS cnt
FROM public.orders_core c WHERE c.id IN (SELECT core_id FROM _dev_store_core_ids)
UNION ALL
SELECT 'orders_food', COUNT(*)::bigint FROM public.orders_food f
WHERE f.id IN (SELECT food_id FROM _dev_store_food_ids)
UNION ALL
SELECT 'unified_tickets (order-linked)', COUNT(*)::bigint
FROM public.unified_tickets t WHERE t.order_id IN (SELECT core_id FROM _dev_store_core_ids)
UNION ALL
SELECT 'merchant_wallet_ledger', COUNT(*)::bigint
FROM public.merchant_wallet_ledger mwl
WHERE mwl.wallet_id IN (SELECT wallet_id FROM _dev_store_wallet_ids)
UNION ALL
SELECT 'merchant_payout_requests', COUNT(*)::bigint
FROM public.merchant_payout_requests pr
WHERE pr.wallet_id IN (SELECT wallet_id FROM _dev_store_wallet_ids)
UNION ALL
SELECT 'merchant_wallet_credit_requests', COUNT(*)::bigint
FROM public.merchant_wallet_credit_requests cr
WHERE cr.merchant_store_id = current_setting('app.dev_delete_store_id')::bigint;

-- ---------------------------------------------------------------------------
-- 1) Tickets (before orders — avoids unified_tickets_order_check on FK SET NULL)
-- ---------------------------------------------------------------------------
DELETE FROM public.unified_tickets t
WHERE t.order_id IN (SELECT core_id FROM _dev_store_core_ids);

DELETE FROM public.unified_tickets t
WHERE t.merchant_store_id = current_setting('app.dev_delete_store_id')::bigint
  AND t.ticket_type = 'ORDER_RELATED';

-- ---------------------------------------------------------------------------
-- 2) Wallet / payments for this store (full reset — keeps wallet row + bank accounts)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_store_id BIGINT := current_setting('app.dev_delete_store_id')::bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'withdrawal_invoices') THEN
    DELETE FROM public.withdrawal_invoices wi
    WHERE wi.payout_request_id IN (
      SELECT pr.id FROM public.merchant_payout_requests pr
      WHERE pr.wallet_id IN (SELECT wallet_id FROM _dev_store_wallet_ids)
    );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_payout_retries') THEN
    DELETE FROM public.payment_payout_retries ppr
    WHERE ppr.payout_approval_id IN (
      SELECT ppa.id FROM public.payment_payout_approvals ppa
      WHERE ppa.payout_request_id IN (
        SELECT pr.id FROM public.merchant_payout_requests pr
        WHERE pr.wallet_id IN (SELECT wallet_id FROM _dev_store_wallet_ids)
      )
    );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_payout_approvals') THEN
    DELETE FROM public.payment_payout_approvals ppa
    WHERE ppa.payout_request_id IN (
      SELECT pr.id FROM public.merchant_payout_requests pr
      WHERE pr.wallet_id IN (SELECT wallet_id FROM _dev_store_wallet_ids)
    );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_payout_requests') THEN
    DELETE FROM public.merchant_payout_requests pr
    WHERE pr.wallet_id IN (SELECT wallet_id FROM _dev_store_wallet_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_wallet_credit_requests') THEN
    DELETE FROM public.merchant_wallet_credit_requests cr
    WHERE cr.merchant_store_id = v_store_id
       OR cr.wallet_id IN (SELECT wallet_id FROM _dev_store_wallet_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_penalties') THEN
    DELETE FROM public.merchant_penalties mp
    WHERE mp.wallet_id IN (SELECT wallet_id FROM _dev_store_wallet_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_reversal_ledger') THEN
    DELETE FROM public.payment_reversal_ledger prl
    WHERE prl.wallet_id IN (SELECT wallet_id FROM _dev_store_wallet_ids)
       OR prl.order_id IN (SELECT core_id FROM _dev_store_core_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_refund_ledger') THEN
    DELETE FROM public.payment_refund_ledger prf
    WHERE prf.wallet_id IN (SELECT wallet_id FROM _dev_store_wallet_ids)
       OR prf.order_id IN (SELECT core_id FROM _dev_store_core_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_order_settlements') THEN
    DELETE FROM public.payment_order_settlements pos
    WHERE pos.wallet_id IN (SELECT wallet_id FROM _dev_store_wallet_ids)
       OR pos.order_id IN (SELECT core_id FROM _dev_store_core_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_settlement_breakdown') THEN
    DELETE FROM public.order_settlement_breakdown osb
    WHERE osb.order_id IN (SELECT core_id FROM _dev_store_core_ids)
       OR osb.wallet_id IN (SELECT wallet_id FROM _dev_store_wallet_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_settlement_batches') THEN
    DELETE FROM public.merchant_settlement_batches msb
    WHERE msb.merchant_store_id = v_store_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_commission_invoices') THEN
    DELETE FROM public.merchant_commission_invoices mci
    WHERE mci.merchant_store_id = v_store_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_wallet_transactions') THEN
    DELETE FROM public.merchant_wallet_transactions mwt
    WHERE mwt.wallet_id IN (SELECT wallet_id FROM _dev_store_wallet_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_wallet_ledger') THEN
    ALTER TABLE public.merchant_wallet_ledger DISABLE TRIGGER trg_merchant_wallet_ledger_no_delete;
    ALTER TABLE public.merchant_wallet_ledger DISABLE TRIGGER trg_merchant_wallet_ledger_no_update;

    DELETE FROM public.merchant_wallet_ledger mwl
    WHERE mwl.wallet_id IN (SELECT wallet_id FROM _dev_store_wallet_ids)
       OR (
         mwl.reference_type = 'ORDER'
         AND mwl.reference_id IN (SELECT food_id FROM _dev_store_food_ids)
       );

    ALTER TABLE public.merchant_wallet_ledger ENABLE TRIGGER trg_merchant_wallet_ledger_no_delete;
    ALTER TABLE public.merchant_wallet_ledger ENABLE TRIGGER trg_merchant_wallet_ledger_no_update;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_wallet') THEN
    UPDATE public.merchant_wallet w
    SET
      available_balance = 0,
      pending_balance = 0,
      hold_balance = 0,
      reserve_balance = 0,
      locked_balance = 0,
      pending_settlement = 0,
      total_earned = 0,
      total_withdrawn = 0,
      total_penalty = 0,
      total_commission_deducted = 0,
      lifetime_credit = 0,
      lifetime_debit = 0,
      settlement_paused = FALSE,
      frozen_reason = NULL,
      status = 'ACTIVE',
      updated_at = NOW()
    WHERE w.merchant_store_id = v_store_id;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Legacy order children
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_item_addons') THEN
    DELETE FROM public.order_item_addons oia
    WHERE oia.order_item_id IN (
      SELECT oi.id FROM public.order_items oi
      WHERE oi.order_id IN (SELECT core_id FROM _dev_store_core_ids)
    );
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN
    DELETE FROM public.order_items oi
    WHERE oi.order_id IN (SELECT core_id FROM _dev_store_core_ids);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_food_items') THEN
    DELETE FROM public.order_food_items ofi
    WHERE ofi.order_id IN (SELECT core_id FROM _dev_store_core_ids);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_payments') THEN
    DELETE FROM public.order_payments op
    WHERE op.order_id IN (SELECT core_id FROM _dev_store_core_ids);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Orders (CASCADE timelines, cancellations, food rows, …)
-- ---------------------------------------------------------------------------
DELETE FROM public.orders_core c
WHERE c.id IN (SELECT core_id FROM _dev_store_core_ids);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
    DELETE FROM public.orders o
    WHERE o.id IN (SELECT core_id FROM _dev_store_core_ids);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Post-check
-- ---------------------------------------------------------------------------
SELECT 'orders_core left' AS check_label, COUNT(*)::bigint AS cnt
FROM public.orders_core c
WHERE c.merchant_store_id = current_setting('app.dev_delete_store_id')::bigint
UNION ALL
SELECT 'wallet available_balance', COALESCE(MAX(w.available_balance), 0)
FROM public.merchant_wallet w
WHERE w.merchant_store_id = current_setting('app.dev_delete_store_id')::bigint
UNION ALL
SELECT 'ledger rows left', COUNT(*)::bigint
FROM public.merchant_wallet_ledger mwl
WHERE mwl.wallet_id IN (SELECT wallet_id FROM _dev_store_wallet_ids);

COMMIT;
