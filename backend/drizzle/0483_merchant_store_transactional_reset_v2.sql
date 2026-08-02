-- =============================================================================
-- 0483_merchant_store_transactional_reset_v2.sql
-- =============================================================================
-- Replaces purge_merchant_store_transactional_data() (from 0393) with v2 that also
-- clears post-0393 operational tables: payout cycles/summaries, plan purchase /
-- refund history, KOT counters, store activity / status ops logs.
--
-- KEEPS: merchant_stores row, menu, hours, bank/UPI accounts, staff, contracts,
--        active merchant_subscriptions, wallet shell (zeroed), push tokens,
--        settings, documents, FSSAI/GST, onboarding.
--
-- DELETES: orders, payments, wallet ledger, payouts/settlements, tickets, reviews,
--          complaints, dispatch/rider assignment rows, GM ledger, analytics,
--          subscription_payments + refund audit (plan purchase history only),
--          merchant offers / coupons, store notifications, ops activity logs.
--
-- Does NOT delete customers, riders, or global config catalogs.
--
-- Usage (Supabase SQL editor):
--   SELECT public.purge_merchant_store_transactional_data('GMMC1025', 77, FALSE);
--   BEGIN;
--   SELECT public.purge_merchant_store_transactional_data('GMMC1025', 77, TRUE);
--   COMMIT;
-- =============================================================================

CREATE OR REPLACE FUNCTION public.purge_merchant_store_transactional_data(
  p_store_public_id TEXT DEFAULT NULL,
  p_merchant_store_id BIGINT DEFAULT NULL,
  p_execute BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id BIGINT;
  v_public_id TEXT;
  v_store_name TEXT;
  v_core_ids BIGINT[];
  v_food_ids BIGINT[];
  v_wallet_ids BIGINT[];
  v_order_id_texts TEXT[];
  v_cnt BIGINT;
  v_result JSONB := '{}'::jsonb;
  v_deleted JSONB := '{}'::jsonb;
  v_preview JSONB := '{}'::jsonb;
BEGIN
  -- -------------------------------------------------------------------------
  -- Resolve store
  -- -------------------------------------------------------------------------
  IF p_merchant_store_id IS NOT NULL AND p_merchant_store_id > 0 THEN
    SELECT ms.id, ms.store_id, ms.store_name
      INTO v_store_id, v_public_id, v_store_name
    FROM public.merchant_stores ms
    WHERE ms.id = p_merchant_store_id AND ms.deleted_at IS NULL
    LIMIT 1;
  ELSIF p_store_public_id IS NOT NULL AND length(trim(p_store_public_id)) > 0 THEN
    SELECT ms.id, ms.store_id, ms.store_name
      INTO v_store_id, v_public_id, v_store_name
    FROM public.merchant_stores ms
    WHERE ms.store_id = trim(p_store_public_id) AND ms.deleted_at IS NULL
    LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Provide p_store_public_id (e.g. GMMC1025) or p_merchant_store_id';
  END IF;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Store not found: public_id=% internal_id=%', p_store_public_id, p_merchant_store_id;
  END IF;

  -- -------------------------------------------------------------------------
  -- Scope sets
  -- -------------------------------------------------------------------------
  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::bigint[])
    INTO v_core_ids
  FROM (
    SELECT c.id AS x
    FROM public.orders_core c
    WHERE c.merchant_store_id = v_store_id
    UNION
    SELECT f.order_id AS x
    FROM public.orders_food f
    WHERE f.merchant_store_id = v_store_id AND f.order_id IS NOT NULL
  ) s;

  SELECT COALESCE(array_agg(DISTINCT f.id), ARRAY[]::bigint[])
    INTO v_food_ids
  FROM public.orders_food f
  WHERE f.merchant_store_id = v_store_id
     OR (cardinality(v_core_ids) > 0 AND f.order_id = ANY(v_core_ids));

  SELECT COALESCE(array_agg(w.id), ARRAY[]::bigint[])
    INTO v_wallet_ids
  FROM public.merchant_wallet w
  WHERE w.merchant_store_id = v_store_id;

  SELECT COALESCE(array_agg(DISTINCT t), ARRAY[]::text[])
    INTO v_order_id_texts
  FROM (
    SELECT c.order_id::text AS t
    FROM public.orders_core c
    WHERE c.merchant_store_id = v_store_id AND c.order_id IS NOT NULL
    UNION
    SELECT c.formatted_order_id AS t
    FROM public.orders_core c
    WHERE c.merchant_store_id = v_store_id AND c.formatted_order_id IS NOT NULL
    UNION
    SELECT c.id::text AS t
    FROM public.orders_core c
    WHERE c.merchant_store_id = v_store_id
  ) s
  WHERE t IS NOT NULL AND length(trim(t)) > 0;

  -- -------------------------------------------------------------------------
  -- Preview counts
  -- -------------------------------------------------------------------------
  SELECT COUNT(*) INTO v_cnt FROM public.orders_core c WHERE c.merchant_store_id = v_store_id;
  v_preview := v_preview || jsonb_build_object('orders_core', v_cnt);

  SELECT COUNT(*) INTO v_cnt FROM public.orders_food f WHERE f.merchant_store_id = v_store_id
     OR (cardinality(v_core_ids) > 0 AND f.order_id = ANY(v_core_ids));
  v_preview := v_preview || jsonb_build_object('orders_food', v_cnt);

  SELECT COUNT(*) INTO v_cnt FROM public.pending_orders po WHERE po.merchant_store_id = v_store_id;
  v_preview := v_preview || jsonb_build_object('pending_orders', v_cnt);

  IF to_regclass('public.unified_tickets') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_cnt FROM public.unified_tickets t
    WHERE t.merchant_store_id = v_store_id
       OR (cardinality(v_core_ids) > 0 AND t.order_id = ANY(v_core_ids));
    v_preview := v_preview || jsonb_build_object('unified_tickets', v_cnt);
  END IF;

  IF to_regclass('public.merchant_wallet_ledger') IS NOT NULL AND cardinality(v_wallet_ids) > 0 THEN
    SELECT COUNT(*) INTO v_cnt FROM public.merchant_wallet_ledger mwl
    WHERE mwl.wallet_id = ANY(v_wallet_ids)
       OR (mwl.reference_type = 'ORDER' AND cardinality(v_food_ids) > 0 AND mwl.reference_id = ANY(v_food_ids));
    v_preview := v_preview || jsonb_build_object('merchant_wallet_ledger', v_cnt);
  END IF;

  IF to_regclass('public.merchant_payout_requests') IS NOT NULL AND cardinality(v_wallet_ids) > 0 THEN
    SELECT COUNT(*) INTO v_cnt FROM public.merchant_payout_requests pr WHERE pr.wallet_id = ANY(v_wallet_ids);
    v_preview := v_preview || jsonb_build_object('merchant_payout_requests', v_cnt);
  END IF;

  IF to_regclass('public.merchant_store_notifications') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_cnt FROM public.merchant_store_notifications n WHERE n.store_id = v_store_id;
    v_preview := v_preview || jsonb_build_object('merchant_store_notifications', v_cnt);
  END IF;

  IF to_regclass('public.merchant_payout_cycles') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_cnt FROM public.merchant_payout_cycles c WHERE c.merchant_store_id = v_store_id;
    v_preview := v_preview || jsonb_build_object('merchant_payout_cycles', v_cnt);
  END IF;

  IF to_regclass('public.merchant_payout_summaries') IS NOT NULL AND cardinality(v_wallet_ids) > 0 THEN
    SELECT COUNT(*) INTO v_cnt FROM public.merchant_payout_summaries s WHERE s.wallet_id = ANY(v_wallet_ids);
    v_preview := v_preview || jsonb_build_object('merchant_payout_summaries', v_cnt);
  END IF;

  IF to_regclass('public.subscription_payments') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_cnt FROM public.subscription_payments sp WHERE sp.store_id = v_store_id;
    v_preview := v_preview || jsonb_build_object('subscription_payments', v_cnt);
  END IF;

  IF NOT p_execute THEN
    RETURN jsonb_build_object(
      'mode', 'preview',
      'merchant_store_id', v_store_id,
      'store_id', v_public_id,
      'store_name', v_store_name,
      'counts', v_preview
    );
  END IF;

  -- =========================================================================
  -- EXECUTE — deletion order matters (tickets → wallet → dispatch → orders)
  -- =========================================================================

  -- A) Carts & group orders
  IF to_regclass('public.pending_orders') IS NOT NULL THEN
    DELETE FROM public.pending_orders po WHERE po.merchant_store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('pending_orders', v_cnt);
  END IF;

  IF to_regclass('public.group_order_items') IS NOT NULL
     AND to_regclass('public.group_orders') IS NOT NULL THEN
    DELETE FROM public.group_order_items gi
    WHERE gi.group_order_id IN (
      SELECT g.id FROM public.group_orders g WHERE g.store_id = v_store_id
    );
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('group_order_items', v_cnt);
  END IF;

  IF to_regclass('public.group_order_members') IS NOT NULL
     AND to_regclass('public.group_orders') IS NOT NULL THEN
    DELETE FROM public.group_order_members gm
    WHERE gm.group_order_id IN (
      SELECT g.id FROM public.group_orders g WHERE g.store_id = v_store_id
    );
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('group_order_members', v_cnt);
  END IF;

  IF to_regclass('public.group_orders') IS NOT NULL THEN
    DELETE FROM public.group_orders g WHERE g.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('group_orders', v_cnt);
  END IF;

  -- B) Reviews & complaints (store-scoped)
  IF to_regclass('public.restaurant_reports') IS NOT NULL THEN
    DELETE FROM public.restaurant_reports rr WHERE rr.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('restaurant_reports', v_cnt);
  END IF;

  IF to_regclass('public.merchant_store_ratings') IS NOT NULL THEN
    DELETE FROM public.merchant_store_ratings msr
    WHERE msr.store_id = v_store_id
       OR (cardinality(v_core_ids) > 0 AND msr.order_id = ANY(v_core_ids));
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_store_ratings', v_cnt);
  END IF;

  IF to_regclass('public.customer_ratings_given') IS NOT NULL THEN
    DELETE FROM public.customer_ratings_given crg
    WHERE (cardinality(v_core_ids) > 0 AND crg.order_id = ANY(v_core_ids))
       OR (crg.target_type ILIKE '%merchant%' AND crg.target_id = v_store_id);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('customer_ratings_given', v_cnt);
  END IF;

  IF to_regclass('public.ratings') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.ratings r WHERE r.order_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('ratings', v_cnt);
  END IF;

  -- C) Tickets BEFORE orders_core (DELETE required — FK ON DELETE SET NULL violates unified_tickets_order_check)
  IF to_regclass('public.unified_tickets') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    CREATE TEMP TABLE _purge_store_ticket_ids (ticket_id BIGINT PRIMARY KEY) ON COMMIT DROP;

    INSERT INTO _purge_store_ticket_ids (ticket_id)
    SELECT DISTINCT t.id
    FROM public.unified_tickets t
    WHERE t.merchant_store_id = v_store_id
       OR t.order_id = ANY(v_core_ids)
       OR EXISTS (
         SELECT 1
         FROM public.orders_core oc
         WHERE oc.merchant_store_id = v_store_id
           AND oc.id = ANY(v_core_ids)
           AND (
             t.order_id = oc.id
             OR COALESCE(t.metadata->'customer_help'->>'order_id_app', '') IN (
               oc.id::text,
               COALESCE(oc.order_id, ''),
               COALESCE(oc.formatted_order_id, '')
             )
             OR (
               cardinality(v_order_id_texts) > 0
               AND COALESCE(t.metadata->>'order_id', '') = ANY(v_order_id_texts)
             )
             OR (
               oc.formatted_order_id IS NOT NULL
               AND t.subject ILIKE ('%' || oc.formatted_order_id || '%')
             )
             OR (
               oc.order_id IS NOT NULL
               AND t.subject ILIKE ('%' || oc.order_id || '%')
             )
           )
       );

    IF to_regclass('public.unified_ticket_messages') IS NOT NULL THEN
      DELETE FROM public.unified_ticket_messages m
      WHERE m.ticket_id IN (SELECT ticket_id FROM _purge_store_ticket_ids);
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      v_deleted := v_deleted || jsonb_build_object('unified_ticket_messages', v_cnt);
    END IF;

    IF to_regclass('public.unified_ticket_activities') IS NOT NULL THEN
      DELETE FROM public.unified_ticket_activities a
      WHERE a.ticket_id IN (SELECT ticket_id FROM _purge_store_ticket_ids);
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      v_deleted := v_deleted || jsonb_build_object('unified_ticket_activities', v_cnt);
    END IF;

    IF to_regclass('public.unified_ticket_activity_audit') IS NOT NULL THEN
      DELETE FROM public.unified_ticket_activity_audit a
      WHERE a.ticket_id IN (SELECT ticket_id FROM _purge_store_ticket_ids);
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      v_deleted := v_deleted || jsonb_build_object('unified_ticket_activity_audit', v_cnt);
    END IF;

    IF to_regclass('public.unified_ticket_merges') IS NOT NULL THEN
      DELETE FROM public.unified_ticket_merges m
      WHERE m.primary_ticket_id IN (SELECT ticket_id FROM _purge_store_ticket_ids)
         OR m.merged_ticket_id IN (SELECT ticket_id FROM _purge_store_ticket_ids);
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      v_deleted := v_deleted || jsonb_build_object('unified_ticket_merges', v_cnt);
    END IF;

    DELETE FROM public.unified_tickets t
    WHERE t.id IN (SELECT ticket_id FROM _purge_store_ticket_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('unified_tickets', v_cnt);

    DROP TABLE IF EXISTS _purge_store_ticket_ids;
  ELSIF to_regclass('public.unified_tickets') IS NOT NULL THEN
    DELETE FROM public.unified_tickets t WHERE t.merchant_store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('unified_tickets', v_cnt);
  END IF;

  IF to_regclass('public.order_tickets') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.order_tickets ot WHERE ot.order_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_tickets', v_cnt);
  END IF;

  -- D) Legacy payouts (merchant_store_payouts)
  IF to_regclass('public.merchant_store_payout_history') IS NOT NULL
     AND to_regclass('public.merchant_store_payouts') IS NOT NULL THEN
    DELETE FROM public.merchant_store_payout_history h
    WHERE h.payout_id IN (
      SELECT p.id FROM public.merchant_store_payouts p WHERE p.store_id = v_store_id
    );
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_store_payout_history', v_cnt);
  END IF;

  IF to_regclass('public.merchant_store_settlements') IS NOT NULL THEN
    DELETE FROM public.merchant_store_settlements s WHERE s.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_store_settlements', v_cnt);
  END IF;

  IF to_regclass('public.merchant_store_payouts') IS NOT NULL THEN
    DELETE FROM public.merchant_store_payouts p WHERE p.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_store_payouts', v_cnt);
  END IF;

  -- E) Wallet / payment chain
  IF cardinality(v_wallet_ids) > 0 THEN
    IF to_regclass('public.withdrawal_invoices') IS NOT NULL THEN
      DELETE FROM public.withdrawal_invoices wi
      WHERE wi.payout_request_id IN (
        SELECT pr.id FROM public.merchant_payout_requests pr WHERE pr.wallet_id = ANY(v_wallet_ids)
      );
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      v_deleted := v_deleted || jsonb_build_object('withdrawal_invoices', v_cnt);
    END IF;

    IF to_regclass('public.payment_payout_retries') IS NOT NULL THEN
      DELETE FROM public.payment_payout_retries ppr
      WHERE ppr.payout_approval_id IN (
        SELECT ppa.id FROM public.payment_payout_approvals ppa
        WHERE ppa.payout_request_id IN (
          SELECT pr.id FROM public.merchant_payout_requests pr WHERE pr.wallet_id = ANY(v_wallet_ids)
        )
      );
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      v_deleted := v_deleted || jsonb_build_object('payment_payout_retries', v_cnt);
    END IF;

    IF to_regclass('public.payment_payout_approvals') IS NOT NULL THEN
      DELETE FROM public.payment_payout_approvals ppa
      WHERE ppa.payout_request_id IN (
        SELECT pr.id FROM public.merchant_payout_requests pr WHERE pr.wallet_id = ANY(v_wallet_ids)
      );
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      v_deleted := v_deleted || jsonb_build_object('payment_payout_approvals', v_cnt);
    END IF;

    IF to_regclass('public.merchant_payout_requests') IS NOT NULL THEN
      DELETE FROM public.merchant_payout_requests pr WHERE pr.wallet_id = ANY(v_wallet_ids);
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      v_deleted := v_deleted || jsonb_build_object('merchant_payout_requests', v_cnt);
    END IF;
  END IF;

  IF to_regclass('public.merchant_wallet_credit_requests') IS NOT NULL THEN
    DELETE FROM public.merchant_wallet_credit_requests cr
    WHERE cr.merchant_store_id = v_store_id
       OR (cardinality(v_wallet_ids) > 0 AND cr.wallet_id = ANY(v_wallet_ids));
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_wallet_credit_requests', v_cnt);
  END IF;

  IF to_regclass('public.merchant_penalties') IS NOT NULL AND cardinality(v_wallet_ids) > 0 THEN
    DELETE FROM public.merchant_penalties mp WHERE mp.wallet_id = ANY(v_wallet_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_penalties', v_cnt);
  END IF;

  IF to_regclass('public.payment_reversal_ledger') IS NOT NULL THEN
    DELETE FROM public.payment_reversal_ledger prl
    WHERE (cardinality(v_wallet_ids) > 0 AND prl.wallet_id = ANY(v_wallet_ids))
       OR (cardinality(v_core_ids) > 0 AND prl.order_id = ANY(v_core_ids));
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('payment_reversal_ledger', v_cnt);
  END IF;

  IF to_regclass('public.payment_refund_ledger') IS NOT NULL THEN
    DELETE FROM public.payment_refund_ledger prf
    WHERE (cardinality(v_wallet_ids) > 0 AND prf.wallet_id = ANY(v_wallet_ids))
       OR (cardinality(v_core_ids) > 0 AND prf.order_id = ANY(v_core_ids));
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('payment_refund_ledger', v_cnt);
  END IF;

  IF to_regclass('public.payment_order_settlements') IS NOT NULL THEN
    DELETE FROM public.payment_order_settlements pos
    WHERE (cardinality(v_wallet_ids) > 0 AND pos.wallet_id = ANY(v_wallet_ids))
       OR (cardinality(v_core_ids) > 0 AND pos.order_id = ANY(v_core_ids));
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('payment_order_settlements', v_cnt);
  END IF;

  IF to_regclass('public.order_settlement_breakdown') IS NOT NULL THEN
    DELETE FROM public.order_settlement_breakdown osb
    WHERE (cardinality(v_core_ids) > 0 AND osb.order_id = ANY(v_core_ids))
       OR (cardinality(v_wallet_ids) > 0 AND osb.wallet_id = ANY(v_wallet_ids));
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_settlement_breakdown', v_cnt);
  END IF;

  IF to_regclass('public.merchant_settlement_batches') IS NOT NULL THEN
    DELETE FROM public.merchant_settlement_batches msb WHERE msb.merchant_store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_settlement_batches', v_cnt);
  END IF;

  IF to_regclass('public.merchant_commission_invoices') IS NOT NULL THEN
    DELETE FROM public.merchant_commission_invoices mci WHERE mci.merchant_store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_commission_invoices', v_cnt);
  END IF;

  -- E2) Payout cycles + locked summaries (post-0393 / Payments & Ledger UI)
  -- IMPORTANT: summaries.cycle_id has ON DELETE SET NULL from cycles — that UPDATE
  -- hits LOCKED rows and fails. Disable lock trigger, delete summaries first, then cycles.
  IF to_regclass('public.merchant_payout_summaries') IS NOT NULL AND cardinality(v_wallet_ids) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.merchant_payout_summaries'::regclass
        AND tgname ILIKE '%locked%'
        AND NOT tgisinternal
    ) THEN
      EXECUTE (
        SELECT 'ALTER TABLE public.merchant_payout_summaries DISABLE TRIGGER '
          || quote_ident(tgname)
        FROM pg_trigger
        WHERE tgrelid = 'public.merchant_payout_summaries'::regclass
          AND tgname ILIKE '%locked%'
          AND NOT tgisinternal
        LIMIT 1
      );
    END IF;

    DELETE FROM public.merchant_payout_summaries s WHERE s.wallet_id = ANY(v_wallet_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_payout_summaries', v_cnt);

    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.merchant_payout_summaries'::regclass
        AND tgname ILIKE '%locked%'
        AND NOT tgisinternal
    ) THEN
      EXECUTE (
        SELECT 'ALTER TABLE public.merchant_payout_summaries ENABLE TRIGGER '
          || quote_ident(tgname)
        FROM pg_trigger
        WHERE tgrelid = 'public.merchant_payout_summaries'::regclass
          AND tgname ILIKE '%locked%'
          AND NOT tgisinternal
        LIMIT 1
      );
    END IF;
  END IF;

  IF to_regclass('public.merchant_payout_cycles') IS NOT NULL THEN
    DELETE FROM public.merchant_payout_cycles c
    WHERE c.merchant_store_id = v_store_id
       OR (cardinality(v_wallet_ids) > 0 AND c.wallet_id = ANY(v_wallet_ids));
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_payout_cycles', v_cnt);
  END IF;

  -- E3) Plan purchase history (keep merchant_subscriptions; clear payment/refund audit)
  IF to_regclass('public.merchant_subscription_renewal_attempts') IS NOT NULL THEN
    DELETE FROM public.merchant_subscription_renewal_attempts a WHERE a.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_subscription_renewal_attempts', v_cnt);
  END IF;

  IF to_regclass('public.merchant_subscription_notifications') IS NOT NULL THEN
    DELETE FROM public.merchant_subscription_notifications n WHERE n.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_subscription_notifications', v_cnt);
  END IF;

  IF to_regclass('public.merchant_subscription_refunds') IS NOT NULL THEN
    DELETE FROM public.merchant_subscription_refunds r WHERE r.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_subscription_refunds', v_cnt);
  END IF;

  IF to_regclass('public.subscription_payments') IS NOT NULL THEN
    DELETE FROM public.subscription_payments sp WHERE sp.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('subscription_payments', v_cnt);
  END IF;

  IF to_regclass('public.payment_fraud_flags') IS NOT NULL AND cardinality(v_wallet_ids) > 0 THEN
    DELETE FROM public.payment_fraud_flags pff WHERE pff.wallet_id = ANY(v_wallet_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('payment_fraud_flags', v_cnt);
  END IF;

  IF to_regclass('public.payment_wallet_freeze_logs') IS NOT NULL AND cardinality(v_wallet_ids) > 0 THEN
    DELETE FROM public.payment_wallet_freeze_logs pwl WHERE pwl.wallet_id = ANY(v_wallet_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('payment_wallet_freeze_logs', v_cnt);
  END IF;

  IF to_regclass('public.merchant_wallet_transactions') IS NOT NULL AND cardinality(v_wallet_ids) > 0 THEN
    DELETE FROM public.merchant_wallet_transactions mwt WHERE mwt.wallet_id = ANY(v_wallet_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_wallet_transactions', v_cnt);
  END IF;

  IF to_regclass('public.merchant_wallet_ledger') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_merchant_wallet_ledger_no_delete'
        AND tgrelid = 'public.merchant_wallet_ledger'::regclass
    ) THEN
      ALTER TABLE public.merchant_wallet_ledger DISABLE TRIGGER trg_merchant_wallet_ledger_no_delete;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_merchant_wallet_ledger_no_update'
        AND tgrelid = 'public.merchant_wallet_ledger'::regclass
    ) THEN
      ALTER TABLE public.merchant_wallet_ledger DISABLE TRIGGER trg_merchant_wallet_ledger_no_update;
    END IF;

    DELETE FROM public.merchant_wallet_ledger mwl
    WHERE (cardinality(v_wallet_ids) > 0 AND mwl.wallet_id = ANY(v_wallet_ids))
       OR (
         mwl.reference_type = 'ORDER'
         AND cardinality(v_food_ids) > 0
         AND mwl.reference_id = ANY(v_food_ids)
       );
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_wallet_ledger', v_cnt);

    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_merchant_wallet_ledger_no_delete'
        AND tgrelid = 'public.merchant_wallet_ledger'::regclass
    ) THEN
      ALTER TABLE public.merchant_wallet_ledger ENABLE TRIGGER trg_merchant_wallet_ledger_no_delete;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_merchant_wallet_ledger_no_update'
        AND tgrelid = 'public.merchant_wallet_ledger'::regclass
    ) THEN
      ALTER TABLE public.merchant_wallet_ledger ENABLE TRIGGER trg_merchant_wallet_ledger_no_update;
    END IF;
  END IF;

  IF to_regclass('public.merchant_wallet') IS NOT NULL THEN
    UPDATE public.merchant_wallet w
    SET
      available_balance = 0,
      pending_balance = 0,
      hold_balance = 0,
      reserve_balance = 0,
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
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_wallet_zeroed', v_cnt);
  END IF;

  -- F) GM financial engine logs
  IF to_regclass('public.gm_rule_execution_log') IS NOT NULL THEN
    DELETE FROM public.gm_rule_execution_log gel
    WHERE (cardinality(v_core_ids) > 0 AND gel.order_id = ANY(v_core_ids))
       OR (cardinality(v_order_id_texts) > 0 AND gel.core_order_id = ANY(v_order_id_texts))
       OR (cardinality(v_food_ids) > 0 AND gel.orders_food_id = ANY(v_food_ids));
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('gm_rule_execution_log', v_cnt);
  END IF;

  IF to_regclass('public.ledger_entries') IS NOT NULL AND cardinality(v_order_id_texts) > 0 THEN
    DELETE FROM public.ledger_entries le WHERE le.order_id = ANY(v_order_id_texts);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('ledger_entries', v_cnt);
  END IF;

  IF to_regclass('public.ledger_journals') IS NOT NULL AND cardinality(v_order_id_texts) > 0 THEN
    DELETE FROM public.ledger_journals lj WHERE lj.order_id = ANY(v_order_id_texts);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('ledger_journals', v_cnt);
  END IF;

  -- G) Rider dispatch & assignment
  IF to_regclass('public.order_dispatch_rider_notifications') IS NOT NULL
     AND to_regclass('public.order_dispatch_sessions') IS NOT NULL
     AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.order_dispatch_rider_notifications n
    USING public.order_dispatch_sessions s
    WHERE n.session_id = s.id AND s.order_core_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_dispatch_rider_notifications', v_cnt);
  END IF;

  IF to_regclass('public.order_dispatch_sessions') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.order_dispatch_sessions s WHERE s.order_core_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_dispatch_sessions', v_cnt);
  END IF;

  IF to_regclass('public.order_rider_dispatch_exclusions') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.order_rider_dispatch_exclusions e WHERE e.order_core_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_rider_dispatch_exclusions', v_cnt);
  END IF;

  IF to_regclass('public.order_rider_dispatch_assignment_audit') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.order_rider_dispatch_assignment_audit a WHERE a.order_core_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_rider_dispatch_assignment_audit', v_cnt);
  END IF;

  IF to_regclass('public.order_rider_ride_unassignments') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.order_rider_ride_unassignments u WHERE u.order_core_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_rider_ride_unassignments', v_cnt);
  END IF;

  IF to_regclass('public.order_rider_assignment_timeline_events') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.order_rider_assignment_timeline_events e WHERE e.order_core_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_rider_assignment_timeline_events', v_cnt);
  END IF;

  IF to_regclass('public.order_rider_assignments') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.order_rider_assignments a
    WHERE a.order_core_id = ANY(v_core_ids)
       OR (a.order_id IS NOT NULL AND a.order_id = ANY(v_core_ids));
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_rider_assignments', v_cnt);
  END IF;

  IF to_regclass('public.order_rider_assignment_events') IS NOT NULL AND cardinality(v_order_id_texts) > 0 THEN
    DELETE FROM public.order_rider_assignment_events e WHERE e.order_id = ANY(v_order_id_texts);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_rider_assignment_events', v_cnt);
  END IF;

  IF to_regclass('public.order_rider_assignments_current') IS NOT NULL AND cardinality(v_order_id_texts) > 0 THEN
    DELETE FROM public.order_rider_assignments_current c WHERE c.order_id = ANY(v_order_id_texts);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_rider_assignments_current', v_cnt);
  END IF;

  IF to_regclass('public.rider_merchant_pickup_feedback') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.rider_merchant_pickup_feedback f WHERE f.order_core_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('rider_merchant_pickup_feedback', v_cnt);
  END IF;

  IF to_regclass('public.rider_customer_delivery_feedback') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.rider_customer_delivery_feedback f WHERE f.order_core_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('rider_customer_delivery_feedback', v_cnt);
  END IF;

  IF to_regclass('public.food_order_pickup_verifications') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.food_order_pickup_verifications f WHERE f.order_core_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('food_order_pickup_verifications', v_cnt);
  END IF;

  IF to_regclass('public.rider_penalties') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.rider_penalties rp WHERE rp.order_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('rider_penalties', v_cnt);
  END IF;

  -- H) Offer usage (not offer definitions)
  IF to_regclass('public.offer_order_applications') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.offer_order_applications ooa WHERE ooa.order_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('offer_order_applications', v_cnt);
  END IF;

  IF to_regclass('public.merchant_offer_usages') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.merchant_offer_usages mou WHERE mou.order_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_offer_usages', v_cnt);
  END IF;

  -- I) Merchant order actions & legacy children
  IF to_regclass('public.merchant_order_food_actions') IS NOT NULL THEN
    DELETE FROM public.merchant_order_food_actions mofa
    WHERE (cardinality(v_core_ids) > 0 AND mofa.orders_core_id = ANY(v_core_ids))
       OR (cardinality(v_food_ids) > 0 AND mofa.orders_food_id = ANY(v_food_ids));
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_order_food_actions', v_cnt);
  END IF;

  IF to_regclass('public.merchant_store_orders') IS NOT NULL THEN
    DELETE FROM public.merchant_store_orders mso WHERE mso.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_store_orders', v_cnt);
  END IF;

  IF to_regclass('public.order_item_addons') IS NOT NULL
     AND to_regclass('public.order_items') IS NOT NULL
     AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.order_item_addons oia
    WHERE oia.order_item_id IN (
      SELECT oi.id FROM public.order_items oi WHERE oi.order_id = ANY(v_core_ids)
    );
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_item_addons', v_cnt);
  END IF;

  IF to_regclass('public.order_items') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.order_items oi WHERE oi.order_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_items', v_cnt);
  END IF;

  IF to_regclass('public.order_food_items') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.order_food_items ofi WHERE ofi.order_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_food_items', v_cnt);
  END IF;

  IF to_regclass('public.order_payments') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.order_payments op WHERE op.order_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_payments', v_cnt);
  END IF;

  IF to_regclass('public.order_remarks') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.order_remarks orm WHERE orm.order_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_remarks', v_cnt);
  END IF;

  -- I-b) Order-linked satellites (text order_id + support / fraud / ride extension)
  IF to_regclass('public.customer_support_chat_history') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.customer_support_chat_history c WHERE c.order_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('customer_support_chat_history', v_cnt);
  END IF;

  IF to_regclass('public.customer_order_fraud_reports') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.customer_order_fraud_reports r WHERE r.order_core_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('customer_order_fraud_reports', v_cnt);
  END IF;

  IF to_regclass('public.orders_ride') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.orders_ride r WHERE r.order_id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('orders_ride', v_cnt);
  END IF;

  IF to_regclass('public.order_events') IS NOT NULL AND cardinality(v_order_id_texts) > 0 THEN
    DELETE FROM public.order_events e WHERE e.order_id = ANY(v_order_id_texts);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_events', v_cnt);
  END IF;

  IF to_regclass('public.order_notifications') IS NOT NULL AND cardinality(v_order_id_texts) > 0 THEN
    DELETE FROM public.order_notifications n WHERE n.order_id = ANY(v_order_id_texts);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_notifications', v_cnt);
  END IF;

  IF to_regclass('public.order_rider_tracking') IS NOT NULL AND cardinality(v_order_id_texts) > 0 THEN
    DELETE FROM public.order_rider_tracking t WHERE t.order_id = ANY(v_order_id_texts);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_rider_tracking', v_cnt);
  END IF;

  IF to_regclass('public.delivery_assignments') IS NOT NULL AND cardinality(v_order_id_texts) > 0 THEN
    DELETE FROM public.delivery_assignments d WHERE d.order_id = ANY(v_order_id_texts);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('delivery_assignments', v_cnt);
  END IF;

  IF to_regclass('public.rider_tracking_points') IS NOT NULL AND cardinality(v_order_id_texts) > 0 THEN
    DELETE FROM public.rider_tracking_points p WHERE p.order_id = ANY(v_order_id_texts);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('rider_tracking_points', v_cnt);
  END IF;

  IF to_regclass('public.order_tracking_tokens') IS NOT NULL AND cardinality(v_order_id_texts) > 0 THEN
    DELETE FROM public.order_tracking_tokens tok WHERE tok.order_id = ANY(v_order_id_texts);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('order_tracking_tokens', v_cnt);
  END IF;

  IF to_regclass('public.rider_location_history') IS NOT NULL AND cardinality(v_order_id_texts) > 0 THEN
    DELETE FROM public.rider_location_history h
    WHERE h.order_id IS NOT NULL AND h.order_id = ANY(v_order_id_texts);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('rider_location_history', v_cnt);
  END IF;

  -- J) orders_core anchor (CASCADE clears most billing/timeline children)
  IF to_regclass('public.orders') IS NOT NULL AND cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.orders o WHERE o.id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('orders_legacy', v_cnt);
  END IF;

  IF cardinality(v_core_ids) > 0 THEN
    DELETE FROM public.orders_core c WHERE c.id = ANY(v_core_ids);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('orders_core', v_cnt);
  END IF;

  DELETE FROM public.orders_food f WHERE f.merchant_store_id = v_store_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('orders_food_orphans', v_cnt);

  -- K) Store notifications & derived analytics
  IF to_regclass('public.merchant_store_notifications') IS NOT NULL THEN
    DELETE FROM public.merchant_store_notifications n WHERE n.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_store_notifications', v_cnt);
  END IF;

  IF to_regclass('public.merchant_store_daily_analytics') IS NOT NULL THEN
    DELETE FROM public.merchant_store_daily_analytics a WHERE a.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_store_daily_analytics', v_cnt);
  END IF;

  IF to_regclass('public.merchant_menu_item_co_purchases') IS NOT NULL THEN
    DELETE FROM public.merchant_menu_item_co_purchases cp WHERE cp.merchant_store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_menu_item_co_purchases', v_cnt);
  END IF;

  IF to_regclass('public.merchant_store_competitor_snapshots') IS NOT NULL THEN
    DELETE FROM public.merchant_store_competitor_snapshots cs WHERE cs.merchant_store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_store_competitor_snapshots', v_cnt);
  END IF;

  IF to_regclass('public.eta_load_samples') IS NOT NULL THEN
    DELETE FROM public.eta_load_samples e WHERE e.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('eta_load_samples', v_cnt);
  END IF;

  -- K2) Merchant offers / coupons (campaign definitions + mappings for this store)
  IF to_regclass('public.offer_audit_log') IS NOT NULL THEN
    DELETE FROM public.offer_audit_log a WHERE a.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('offer_audit_log', v_cnt);
  END IF;

  IF to_regclass('public.merchant_offers') IS NOT NULL THEN
    IF to_regclass('public.offer_item_mappings') IS NOT NULL THEN
      DELETE FROM public.offer_item_mappings m
      WHERE m.offer_id IN (SELECT o.id FROM public.merchant_offers o WHERE o.store_id = v_store_id);
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      v_deleted := v_deleted || jsonb_build_object('offer_item_mappings', v_cnt);
    END IF;
    IF to_regclass('public.offer_category_mappings') IS NOT NULL THEN
      DELETE FROM public.offer_category_mappings m
      WHERE m.offer_id IN (SELECT o.id FROM public.merchant_offers o WHERE o.store_id = v_store_id);
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      v_deleted := v_deleted || jsonb_build_object('offer_category_mappings', v_cnt);
    END IF;
    IF to_regclass('public.offer_combo_mappings') IS NOT NULL THEN
      DELETE FROM public.offer_combo_mappings m
      WHERE m.offer_id IN (SELECT o.id FROM public.merchant_offers o WHERE o.store_id = v_store_id);
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      v_deleted := v_deleted || jsonb_build_object('offer_combo_mappings', v_cnt);
    END IF;
    IF to_regclass('public.offer_order_applied') IS NOT NULL THEN
      DELETE FROM public.offer_order_applied a
      WHERE a.offer_id IN (SELECT o.id FROM public.merchant_offers o WHERE o.store_id = v_store_id);
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      v_deleted := v_deleted || jsonb_build_object('offer_order_applied', v_cnt);
    END IF;
    IF to_regclass('public.offer_order_applications') IS NOT NULL THEN
      UPDATE public.offer_order_applications a
      SET merchant_offer_id = NULL
      WHERE a.merchant_offer_id IN (SELECT o.id FROM public.merchant_offers o WHERE o.store_id = v_store_id);
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      v_deleted := v_deleted || jsonb_build_object('offer_order_applications_nulled', v_cnt);
    END IF;

    DELETE FROM public.merchant_offers o WHERE o.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_offers', v_cnt);
  END IF;

  IF to_regclass('public.merchant_coupons') IS NOT NULL THEN
    DELETE FROM public.merchant_coupons c WHERE c.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_coupons', v_cnt);
  END IF;

  -- L) Ops activity / status logs (config itself stays; history cleared)
  IF to_regclass('public.store_activity_feed') IS NOT NULL THEN
    DELETE FROM public.store_activity_feed f WHERE f.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('store_activity_feed', v_cnt);
  END IF;

  IF to_regclass('public.merchant_store_activity_log') IS NOT NULL THEN
    DELETE FROM public.merchant_store_activity_log l WHERE l.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_store_activity_log', v_cnt);
  END IF;

  IF to_regclass('public.merchant_store_status_history') IS NOT NULL THEN
    DELETE FROM public.merchant_store_status_history h WHERE h.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_store_status_history', v_cnt);
  END IF;

  IF to_regclass('public.merchant_store_status_log') IS NOT NULL THEN
    DELETE FROM public.merchant_store_status_log l WHERE l.store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('merchant_store_status_log', v_cnt);
  END IF;

  -- M) KOT counter — reset so next ticket starts fresh
  IF to_regclass('public.store_kot_counters') IS NOT NULL THEN
    UPDATE public.store_kot_counters
    SET
      last_value = 0,
      updated_at = NOW()
    WHERE store_id = v_store_id;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('store_kot_counters_reset', v_cnt);
  END IF;

  -- -------------------------------------------------------------------------
  -- Post-check (remaining rows — expect zeros)
  -- -------------------------------------------------------------------------
  SELECT COUNT(*) INTO v_cnt FROM public.orders_core c WHERE c.merchant_store_id = v_store_id;
  v_result := v_result || jsonb_build_object('orders_core_remaining', v_cnt);

  SELECT COUNT(*) INTO v_cnt FROM public.orders_food f WHERE f.merchant_store_id = v_store_id;
  v_result := v_result || jsonb_build_object('orders_food_remaining', v_cnt);

  IF to_regclass('public.merchant_wallet_ledger') IS NOT NULL AND cardinality(v_wallet_ids) > 0 THEN
    SELECT COUNT(*) INTO v_cnt FROM public.merchant_wallet_ledger mwl WHERE mwl.wallet_id = ANY(v_wallet_ids);
    v_result := v_result || jsonb_build_object('merchant_wallet_ledger_remaining', v_cnt);
  END IF;

  IF to_regclass('public.merchant_wallet') IS NOT NULL THEN
    SELECT COALESCE(MAX(w.available_balance), 0) INTO v_cnt
    FROM public.merchant_wallet w WHERE w.merchant_store_id = v_store_id;
    v_result := v_result || jsonb_build_object('wallet_available_balance', v_cnt);
  END IF;

  IF to_regclass('public.unified_tickets') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_cnt FROM public.unified_tickets t WHERE t.merchant_store_id = v_store_id;
    v_result := v_result || jsonb_build_object('unified_tickets_remaining', v_cnt);
  END IF;

  IF to_regclass('public.merchant_payout_requests') IS NOT NULL AND cardinality(v_wallet_ids) > 0 THEN
    SELECT COUNT(*) INTO v_cnt FROM public.merchant_payout_requests pr WHERE pr.wallet_id = ANY(v_wallet_ids);
    v_result := v_result || jsonb_build_object('merchant_payout_requests_remaining', v_cnt);
  END IF;

  IF to_regclass('public.merchant_payout_cycles') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_cnt FROM public.merchant_payout_cycles c WHERE c.merchant_store_id = v_store_id;
    v_result := v_result || jsonb_build_object('merchant_payout_cycles_remaining', v_cnt);
  END IF;

  IF to_regclass('public.subscription_payments') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_cnt FROM public.subscription_payments sp WHERE sp.store_id = v_store_id;
    v_result := v_result || jsonb_build_object('subscription_payments_remaining', v_cnt);
  END IF;

  IF to_regclass('public.merchant_store_notifications') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_cnt FROM public.merchant_store_notifications n WHERE n.store_id = v_store_id;
    v_result := v_result || jsonb_build_object('merchant_store_notifications_remaining', v_cnt);
  END IF;

  IF to_regclass('public.merchant_store_daily_analytics') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_cnt FROM public.merchant_store_daily_analytics a WHERE a.store_id = v_store_id;
    v_result := v_result || jsonb_build_object('merchant_store_daily_analytics_remaining', v_cnt);
  END IF;

  RETURN jsonb_build_object(
    'mode', 'executed',
    'merchant_store_id', v_store_id,
    'store_id', v_public_id,
    'store_name', v_store_name,
    'preview_counts', v_preview,
    'deleted', v_deleted,
    'remaining', v_result
  );
END;
$$;

COMMENT ON FUNCTION public.purge_merchant_store_transactional_data(TEXT, BIGINT, BOOLEAN) IS
  'Ops v2: wipe transactional data for one merchant store (orders, wallet ledger, tickets, payouts, plan payment history). Keeps menu, profile, bank accounts, active subscription. p_execute=FALSE previews only.';

GRANT EXECUTE ON FUNCTION public.purge_merchant_store_transactional_data(TEXT, BIGINT, BOOLEAN) TO service_role;
