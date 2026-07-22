-- ─────────────────────────────────────────────────────────────────────────────
-- 0431 · Reconcile subscriptions left ACTIVE by the refund enum crash
--
-- Because the refund path's revoke UPDATE wrote subscription_status='REFUNDED'
-- into an enum that did not contain it (fixed in 0428), the UPDATE threw 22P02
-- and the subscription was NEVER revoked: it stayed subscription_status=ACTIVE,
-- is_active=true, auto_renew=true even though its payment is REFUNDED. That is
-- why the merchant plan card still shows ACTIVE / Current / Auto-Renew-ON for a
-- refunded plan (e.g. store 77, subscription #6, payment #14).
--
-- Revoke every such subscription and re-run the entitlement engine so premium
-- menu items are locked back to the Free-plan limit (customer-facing surfaces
-- already hide is_locked_by_plan items).
--
-- Requires 0428 (the 'REFUNDED' subscription_status value) to already be applied.
-- Idempotent: only touches subscriptions still in a non-revoked state.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ms.id AS sub_id, ms.store_id
    FROM merchant_subscriptions ms
    JOIN subscription_payments sp ON sp.subscription_id = ms.id
    WHERE sp.payment_status::text IN ('REFUNDED', 'REFUND_PENDING')
      AND (ms.is_active = TRUE
           OR ms.subscription_status::text NOT IN ('REFUNDED', 'CANCELLED', 'EXPIRED'))
  LOOP
    UPDATE merchant_subscriptions
    SET subscription_status = 'REFUNDED',
        payment_status      = 'REFUNDED',
        is_active           = FALSE,
        auto_renew          = FALSE,
        updated_at          = NOW()
    WHERE id = r.sub_id;

    -- Re-lock premium menu items to the now-effective Free plan (non-fatal).
    IF r.store_id IS NOT NULL THEN
      BEGIN
        PERFORM enforce_plan_limits(r.store_id::bigint);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'enforce_plan_limits failed for store %: %', r.store_id, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;
