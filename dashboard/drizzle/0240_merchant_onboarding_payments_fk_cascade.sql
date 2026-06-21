-- =============================================================================
-- Merchant parent delete → purge ALL child + related rows (Supabase Table Editor)
-- =============================================================================
-- Run once in Supabase SQL Editor.
--
-- After this migration, deleting a row from merchant_parents will automatically:
--   • purge every store under that parent (orders, menu, wallet, tickets, …)
--   • purge parent-scoped rows (onboarding payments, subscriptions, users, …)
--   • then allow the parent row delete to succeed
--
-- WARNING: Irreversible. Do NOT delete real production partners by mistake.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Store-level purge (parameterized from delete-store script)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cascade_purge_merchant_store_data(p_store_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_ids bigint[];
BEGIN
  SELECT COALESCE(array_agg(c.id), ARRAY[]::bigint[])
  INTO v_order_ids
  FROM public.orders_core c
  WHERE c.merchant_store_id = p_store_id;

  IF to_regclass('public.pending_orders') IS NOT NULL THEN
    DELETE FROM public.pending_orders WHERE merchant_store_id = p_store_id;
  END IF;

  IF to_regclass('public.restaurant_reports') IS NOT NULL THEN
    DELETE FROM public.restaurant_reports WHERE store_id = p_store_id;
  END IF;

  IF to_regclass('public.merchant_store_ratings') IS NOT NULL THEN
    DELETE FROM public.merchant_store_ratings WHERE store_id = p_store_id;
  END IF;

  IF cardinality(v_order_ids) > 0 THEN
    IF to_regclass('public.customer_ratings_given') IS NOT NULL THEN
      DELETE FROM public.customer_ratings_given
      WHERE order_id = ANY (v_order_ids)
         OR (target_type ILIKE '%merchant%' AND target_id = p_store_id);
    END IF;

    IF to_regclass('public.unified_tickets') IS NOT NULL THEN
      DELETE FROM public.unified_tickets
      WHERE order_id = ANY (v_order_ids) OR merchant_store_id = p_store_id;
    END IF;

    IF to_regclass('public.merchant_store_orders') IS NOT NULL THEN
      DELETE FROM public.merchant_store_orders
      WHERE store_id = p_store_id OR order_id = ANY (v_order_ids);
    END IF;

    IF to_regclass('public.order_item_addons') IS NOT NULL
       AND to_regclass('public.order_items') IS NOT NULL THEN
      DELETE FROM public.order_item_addons oia
      WHERE oia.order_item_id IN (
        SELECT oi.id FROM public.order_items oi WHERE oi.order_id = ANY (v_order_ids)
      );
    END IF;

    IF to_regclass('public.order_items') IS NOT NULL THEN
      DELETE FROM public.order_items WHERE order_id = ANY (v_order_ids);
    END IF;

    IF to_regclass('public.order_food_items') IS NOT NULL THEN
      DELETE FROM public.order_food_items WHERE order_id = ANY (v_order_ids);
    END IF;

    IF to_regclass('public.order_payments') IS NOT NULL THEN
      DELETE FROM public.order_payments WHERE order_id = ANY (v_order_ids);
    END IF;

    IF to_regclass('public.order_tickets') IS NOT NULL THEN
      DELETE FROM public.order_tickets WHERE order_id = ANY (v_order_ids);
    END IF;

    IF to_regclass('public.order_remarks') IS NOT NULL THEN
      DELETE FROM public.order_remarks WHERE order_id = ANY (v_order_ids);
    END IF;

    IF to_regclass('public.orders') IS NOT NULL THEN
      DELETE FROM public.orders WHERE id = ANY (v_order_ids);
    END IF;

    DELETE FROM public.orders_core WHERE id = ANY (v_order_ids);
  ELSE
    IF to_regclass('public.unified_tickets') IS NOT NULL THEN
      DELETE FROM public.unified_tickets WHERE merchant_store_id = p_store_id;
    END IF;

    IF to_regclass('public.merchant_store_orders') IS NOT NULL THEN
      DELETE FROM public.merchant_store_orders WHERE store_id = p_store_id;
    END IF;
  END IF;

  IF to_regclass('public.orders_food') IS NOT NULL THEN
    DELETE FROM public.orders_food WHERE merchant_store_id = p_store_id;
  END IF;

  IF to_regclass('public.merchant_onboarding_payments') IS NOT NULL THEN
    DELETE FROM public.merchant_onboarding_payments WHERE merchant_store_id = p_store_id;
  END IF;

  IF to_regclass('public.merchant_bank_verification_payouts') IS NOT NULL THEN
    DELETE FROM public.merchant_bank_verification_payouts
    WHERE merchant_store_id = p_store_id;
  END IF;

  IF to_regclass('public.merchant_store_registration_progress') IS NOT NULL THEN
    DELETE FROM public.merchant_store_registration_progress WHERE store_id = p_store_id;
  END IF;

  IF to_regclass('public.merchant_wallet') IS NOT NULL THEN
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
      WHERE mwl.wallet_id IN (
        SELECT w.id FROM public.merchant_wallet w WHERE w.merchant_store_id = p_store_id
      );

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

    IF to_regclass('public.merchant_wallet_transactions') IS NOT NULL THEN
      DELETE FROM public.merchant_wallet_transactions mwt
      WHERE mwt.wallet_id IN (
        SELECT w.id FROM public.merchant_wallet w WHERE w.merchant_store_id = p_store_id
      );
    END IF;

    IF to_regclass('public.merchant_payout_requests') IS NOT NULL THEN
      DELETE FROM public.merchant_payout_requests pr
      WHERE pr.wallet_id IN (
        SELECT w.id FROM public.merchant_wallet w WHERE w.merchant_store_id = p_store_id
      );
    END IF;

    DELETE FROM public.merchant_wallet WHERE merchant_store_id = p_store_id;
  END IF;

  IF to_regclass('public.merchant_subscriptions') IS NOT NULL THEN
    IF to_regclass('public.subscription_payments') IS NOT NULL THEN
      DELETE FROM public.subscription_payments sp
      WHERE sp.store_id = p_store_id
         OR sp.merchant_id IN (
           SELECT ms.parent_id FROM public.merchant_stores ms WHERE ms.id = p_store_id
         );
    END IF;
    DELETE FROM public.merchant_subscriptions WHERE store_id = p_store_id;
  END IF;

  -- Menu / docs / hours / bank accounts cascade from merchant_stores in most schemas
  DELETE FROM public.merchant_stores WHERE id = p_store_id;
END;
$$;

COMMENT ON FUNCTION public.cascade_purge_merchant_store_data(bigint) IS
  'Deletes a merchant store and all related transactional + onboarding data.';

-- ---------------------------------------------------------------------------
-- 2) Parent-level purge (all stores + parent-scoped rows)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cascade_purge_merchant_parent_data(p_parent_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id bigint;
BEGIN
  IF to_regclass('public.merchant_onboarding_payments') IS NOT NULL THEN
    DELETE FROM public.merchant_onboarding_payments
    WHERE merchant_parent_id = p_parent_id;
  END IF;

  IF to_regclass('public.merchant_bank_verification_payouts') IS NOT NULL THEN
    DELETE FROM public.merchant_bank_verification_payouts
    WHERE merchant_parent_id = p_parent_id;
  END IF;

  IF to_regclass('public.subscription_payments') IS NOT NULL THEN
    DELETE FROM public.subscription_payments WHERE merchant_id = p_parent_id;
  END IF;

  IF to_regclass('public.merchant_subscriptions') IS NOT NULL THEN
    DELETE FROM public.merchant_subscriptions WHERE merchant_id = p_parent_id;
  END IF;

  IF to_regclass('public.merchant_store_registration_progress') IS NOT NULL THEN
    DELETE FROM public.merchant_store_registration_progress
    WHERE parent_id = p_parent_id;
  END IF;

  IF to_regclass('public.merchant_store_commission_rules') IS NOT NULL THEN
    DELETE FROM public.merchant_store_commission_rules WHERE parent_id = p_parent_id;
  END IF;

  IF to_regclass('public.merchant_store_payouts') IS NOT NULL THEN
    DELETE FROM public.merchant_store_payouts WHERE parent_id = p_parent_id;
  END IF;

  IF to_regclass('public.merchant_coupons') IS NOT NULL THEN
    DELETE FROM public.merchant_coupons WHERE parent_id = p_parent_id;
  END IF;

  IF to_regclass('public.merchant_sessions') IS NOT NULL THEN
    DELETE FROM public.merchant_sessions WHERE merchant_id = p_parent_id;
  END IF;

  IF to_regclass('public.unified_tickets') IS NOT NULL THEN
    DELETE FROM public.unified_tickets WHERE merchant_parent_id = p_parent_id;
  END IF;

  IF to_regclass('public.orders_core') IS NOT NULL THEN
    UPDATE public.orders_core
    SET merchant_parent_id = NULL, updated_at = NOW()
    WHERE merchant_parent_id = p_parent_id
      AND merchant_store_id IS NULL;
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    UPDATE public.orders
    SET merchant_parent_id = NULL, updated_at = NOW()
    WHERE merchant_parent_id = p_parent_id
      AND merchant_store_id IS NULL;
  END IF;

  FOR v_store_id IN
    SELECT ms.id FROM public.merchant_stores ms WHERE ms.parent_id = p_parent_id
  LOOP
    PERFORM public.cascade_purge_merchant_store_data(v_store_id);
  END LOOP;

  IF to_regclass('public.merchant_users') IS NOT NULL THEN
    DELETE FROM public.merchant_users WHERE parent_id = p_parent_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.cascade_purge_merchant_parent_data(bigint) IS
  'Purges all stores and related rows for a merchant parent before parent delete.';

-- ---------------------------------------------------------------------------
-- 3) BEFORE DELETE trigger → Supabase Table Editor delete works
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_merchant_parents_cascade_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.cascade_purge_merchant_parent_data(OLD.id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS merchant_parents_cascade_delete_before ON public.merchant_parents;

CREATE TRIGGER merchant_parents_cascade_delete_before
  BEFORE DELETE ON public.merchant_parents
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_merchant_parents_cascade_delete();

-- ---------------------------------------------------------------------------
-- 4) Align key FKs to CASCADE (belt-and-suspenders for direct child tables)
-- ---------------------------------------------------------------------------
ALTER TABLE public.merchant_onboarding_payments
  DROP CONSTRAINT IF EXISTS merchant_onboarding_payments_merchant_parent_id_fkey;
ALTER TABLE public.merchant_onboarding_payments
  ADD CONSTRAINT merchant_onboarding_payments_merchant_parent_id_fkey
  FOREIGN KEY (merchant_parent_id) REFERENCES public.merchant_parents (id) ON DELETE CASCADE;

ALTER TABLE public.merchant_stores
  DROP CONSTRAINT IF EXISTS merchant_stores_parent_id_fkey;
ALTER TABLE public.merchant_stores
  ADD CONSTRAINT merchant_stores_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES public.merchant_parents (id) ON DELETE CASCADE;

DO $$
BEGIN
  IF to_regclass('public.merchant_subscriptions') IS NOT NULL THEN
    ALTER TABLE public.merchant_subscriptions
      DROP CONSTRAINT IF EXISTS merchant_subscriptions_merchant_id_fk;
    ALTER TABLE public.merchant_subscriptions
      ADD CONSTRAINT merchant_subscriptions_merchant_id_fk
      FOREIGN KEY (merchant_id) REFERENCES public.merchant_parents (id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.subscription_payments') IS NOT NULL THEN
    ALTER TABLE public.subscription_payments
      DROP CONSTRAINT IF EXISTS subscription_payments_merchant_id_fk;
    ALTER TABLE public.subscription_payments
      ADD CONSTRAINT subscription_payments_merchant_id_fk
      FOREIGN KEY (merchant_id) REFERENCES public.merchant_parents (id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.merchant_bank_verification_payouts') IS NOT NULL THEN
    ALTER TABLE public.merchant_bank_verification_payouts
      DROP CONSTRAINT IF EXISTS merchant_bank_verification_payouts_merchant_parent_id_fkey;
    ALTER TABLE public.merchant_bank_verification_payouts
      ADD CONSTRAINT merchant_bank_verification_payouts_merchant_parent_id_fkey
      FOREIGN KEY (merchant_parent_id) REFERENCES public.merchant_parents (id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.merchant_store_orders') IS NOT NULL THEN
    ALTER TABLE public.merchant_store_orders
      DROP CONSTRAINT IF EXISTS merchant_store_orders_store_id_fkey;
    ALTER TABLE public.merchant_store_orders
      ADD CONSTRAINT merchant_store_orders_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.merchant_stores (id) ON DELETE CASCADE;
  END IF;
END $$;
