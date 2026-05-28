-- =============================================================================
-- DEV ONLY: Reset ALL wallet / settlement / payout data for ONE merchant store.
-- Does NOT delete orders. Use dev_delete_merchant_store_orders.sql to wipe orders too.
-- =============================================================================
-- Set store by public code (merchant_stores.store_id) OR internal id (merchant_stores.id).
--
-- Example store: GMMC1025
--   p_store_public_id := 'GMMC1025';
--   p_merchant_store_id := NULL;  -- auto-resolved from store_id
--
-- Prerequisites: 0238 + 0239 applied (ledger immutability triggers exist).
-- Run in Supabase SQL editor. Review PREVIEW, then COMMIT (or ROLLBACK).
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
    WHERE ms.store_id = trim(p_store_public_id)
      AND ms.deleted_at IS NULL
    LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Set p_store_public_id (e.g. GMMC1025) or p_merchant_store_id';
  END IF;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Store not found for public id %', p_store_public_id;
  END IF;

  PERFORM set_config('app.dev_reset_payments_store_id', v_store_id::text, true);
  RAISE NOTICE 'Resetting payments for merchant_stores.id = % (store_id=%)', v_store_id, p_store_public_id;
END $$;

-- ---------------------------------------------------------------------------
-- Scope: orders + wallets for this store
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS _pay_store_core_ids;
CREATE TEMP TABLE _pay_store_core_ids AS
SELECT DISTINCT c.id AS core_id
FROM public.orders_core c
WHERE c.merchant_store_id = current_setting('app.dev_reset_payments_store_id')::bigint
UNION
SELECT DISTINCT f.order_id AS core_id
FROM public.orders_food f
WHERE f.merchant_store_id = current_setting('app.dev_reset_payments_store_id')::bigint
  AND f.order_id IS NOT NULL;

DROP TABLE IF EXISTS _pay_store_food_ids;
CREATE TEMP TABLE _pay_store_food_ids AS
SELECT f.id AS food_id
FROM public.orders_food f
WHERE f.merchant_store_id = current_setting('app.dev_reset_payments_store_id')::bigint
   OR f.order_id IN (SELECT core_id FROM _pay_store_core_ids);

DROP TABLE IF EXISTS _pay_store_wallet_ids;
CREATE TEMP TABLE _pay_store_wallet_ids AS
SELECT w.id AS wallet_id
FROM public.merchant_wallet w
WHERE w.merchant_store_id = current_setting('app.dev_reset_payments_store_id')::bigint;

-- ---------------------------------------------------------------------------
-- PREVIEW (row counts to be removed / zeroed)
-- ---------------------------------------------------------------------------
SELECT 'merchant_stores.id' AS label, current_setting('app.dev_reset_payments_store_id') AS value
UNION ALL
SELECT 'payment_order_settlements', COUNT(*)::text
FROM public.payment_order_settlements pos
WHERE pos.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids)
   OR pos.order_id IN (SELECT core_id FROM _pay_store_core_ids)
UNION ALL
SELECT 'merchant_wallet_ledger', COUNT(*)::text
FROM public.merchant_wallet_ledger mwl
WHERE mwl.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids)
UNION ALL
SELECT 'merchant_payout_requests', COUNT(*)::text
FROM public.merchant_payout_requests pr
WHERE pr.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids)
UNION ALL
SELECT 'wallet available_balance', COALESCE(MAX(w.available_balance)::text, '0')
FROM public.merchant_wallet w
WHERE w.merchant_store_id = current_setting('app.dev_reset_payments_store_id')::bigint;

-- ---------------------------------------------------------------------------
-- Delete payment rows (0239 + legacy wallet tables). Keep merchant_wallet row + bank accounts.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_store_id BIGINT := current_setting('app.dev_reset_payments_store_id')::bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'withdrawal_invoices') THEN
    DELETE FROM public.withdrawal_invoices wi
    WHERE wi.payout_request_id IN (
      SELECT pr.id FROM public.merchant_payout_requests pr
      WHERE pr.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids)
    );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_payout_retries') THEN
    DELETE FROM public.payment_payout_retries ppr
    WHERE ppr.payout_approval_id IN (
      SELECT ppa.id FROM public.payment_payout_approvals ppa
      WHERE ppa.payout_request_id IN (
        SELECT pr.id FROM public.merchant_payout_requests pr
        WHERE pr.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids)
      )
    );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_payout_approvals') THEN
    DELETE FROM public.payment_payout_approvals ppa
    WHERE ppa.payout_request_id IN (
      SELECT pr.id FROM public.merchant_payout_requests pr
      WHERE pr.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids)
    );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_payout_requests') THEN
    DELETE FROM public.merchant_payout_requests pr
    WHERE pr.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_wallet_credit_requests') THEN
    DELETE FROM public.merchant_wallet_credit_requests cr
    WHERE cr.merchant_store_id = v_store_id
       OR cr.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_penalties') THEN
    DELETE FROM public.merchant_penalties mp
    WHERE mp.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_reversal_ledger') THEN
    DELETE FROM public.payment_reversal_ledger prl
    WHERE prl.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids)
       OR prl.order_id IN (SELECT core_id FROM _pay_store_core_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_refund_ledger') THEN
    DELETE FROM public.payment_refund_ledger prf
    WHERE prf.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids)
       OR prf.order_id IN (SELECT core_id FROM _pay_store_core_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_order_settlements') THEN
    DELETE FROM public.payment_order_settlements pos
    WHERE pos.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids)
       OR pos.order_id IN (SELECT core_id FROM _pay_store_core_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_settlement_breakdown') THEN
    DELETE FROM public.order_settlement_breakdown osb
    WHERE osb.order_id IN (SELECT core_id FROM _pay_store_core_ids)
       OR osb.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_settlement_batches') THEN
    DELETE FROM public.merchant_settlement_batches msb
    WHERE msb.merchant_store_id = v_store_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_commission_invoices') THEN
    DELETE FROM public.merchant_commission_invoices mci
    WHERE mci.merchant_store_id = v_store_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_fraud_flags') THEN
    DELETE FROM public.payment_fraud_flags pff
    WHERE pff.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_wallet_freeze_logs') THEN
    DELETE FROM public.payment_wallet_freeze_logs pwfl
    WHERE pwfl.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_reconciliation_mismatches') THEN
    DELETE FROM public.payment_reconciliation_mismatches prm
    WHERE (
      prm.entity_type = 'merchant_wallet'
      AND prm.entity_id IN (SELECT wallet_id FROM _pay_store_wallet_ids)
    )
    OR (
      prm.entity_type IN ('order', 'orders_core', 'ORDER')
      AND prm.entity_id IN (SELECT core_id FROM _pay_store_core_ids)
    );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_wallet_transactions') THEN
    DELETE FROM public.merchant_wallet_transactions mwt
    WHERE mwt.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_wallet_ledger') THEN
    ALTER TABLE public.merchant_wallet_ledger DISABLE TRIGGER trg_merchant_wallet_ledger_no_delete;
    ALTER TABLE public.merchant_wallet_ledger DISABLE TRIGGER trg_merchant_wallet_ledger_no_update;

    DELETE FROM public.merchant_wallet_ledger mwl
    WHERE mwl.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids)
       OR (
         mwl.reference_type = 'ORDER'
         AND mwl.reference_id IN (SELECT food_id FROM _pay_store_food_ids)
       );

    ALTER TABLE public.merchant_wallet_ledger ENABLE TRIGGER trg_merchant_wallet_ledger_no_delete;
    ALTER TABLE public.merchant_wallet_ledger ENABLE TRIGGER trg_merchant_wallet_ledger_no_update;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_wallet') THEN
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
-- POST-CHECK
-- ---------------------------------------------------------------------------
SELECT 'ledger rows left' AS check_label, COUNT(*)::bigint AS cnt
FROM public.merchant_wallet_ledger mwl
WHERE mwl.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids)
UNION ALL
SELECT 'available_balance', COALESCE(MAX(w.available_balance), 0)
FROM public.merchant_wallet w
WHERE w.merchant_store_id = current_setting('app.dev_reset_payments_store_id')::bigint
UNION ALL
SELECT 'payment_order_settlements left', COUNT(*)::bigint
FROM public.payment_order_settlements pos
WHERE pos.wallet_id IN (SELECT wallet_id FROM _pay_store_wallet_ids);

-- COMMIT;   -- uncomment after preview looks correct
-- ROLLBACK;
