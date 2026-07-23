-- ─────────────────────────────────────────────────────────────────────────────
-- 0430 · Backfill refund audit rows that the broken ON CONFLICT swallowed
--
-- Before 0429, every refund audit insert failed (42P10) and was swallowed, so
-- payments that were actually refunded have NO row in merchant_subscription_refunds
-- → the admin "REFUNDS" count shows 0 and the refund history is empty (e.g.
-- payment #14: real Razorpay refund rfnd_TG0CRCJJcIt9pI, yet zero audit rows).
--
-- Reconstruct one audit row per already-refunded WALLET/RAZORPAY payment that is
-- missing one, entirely from the payment row's own data. Actor is unknown for
-- these historical refunds (filed before the fix / via webhook), so it is stamped
-- as 'system'/'backfill' honestly rather than guessed.
--
-- Requires 0429 (the UNIQUE(payment_id) constraint) so ON CONFLICT is valid.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO merchant_subscription_refunds (
  payment_id, subscription_id, merchant_id, store_id, plan_id,
  gateway, amount, total_paise, currency,
  refund_reference, wallet_ledger_id, razorpay_refund_id, razorpay_payment_id,
  status, reason,
  actor_subject_id, actor_system_user_id, actor_email, actor_name, actor_role,
  initiated_at, completed_at
)
SELECT
  sp.id,
  sp.subscription_id,
  sp.merchant_id,
  sp.store_id,
  sp.plan_id,
  UPPER(sp.payment_gateway::text),
  sp.amount,
  COALESCE(NULLIF(sp.total_paise, 0), ROUND(sp.amount * 100))::bigint,
  'INR',
  COALESCE(
    sp.payment_gateway_response->>'razorpay_refund_id',
    sp.payment_gateway_response->>'refund_reference',
    'backfill_' || sp.id
  ),
  NULL,
  CASE WHEN UPPER(sp.payment_gateway::text) = 'RAZORPAY'
       THEN sp.payment_gateway_response->>'razorpay_refund_id' END,
  CASE WHEN UPPER(sp.payment_gateway::text) = 'RAZORPAY'
       THEN sp.payment_gateway_id END,
  CASE WHEN UPPER(sp.payment_status::text) = 'REFUNDED' THEN 'COMPLETED' ELSE 'PENDING' END,
  'Backfilled audit row (refund predates audit-trail fix)',
  'backfill',
  NULL,
  NULL,
  NULL,
  'system',
  COALESCE(
    (sp.payment_gateway_response->>'refund_confirmed_at')::timestamptz,
    sp.payment_date,
    NOW()
  ),
  CASE WHEN UPPER(sp.payment_status::text) = 'REFUNDED'
       THEN COALESCE((sp.payment_gateway_response->>'refund_confirmed_at')::timestamptz, sp.payment_date, NOW())
       END
FROM subscription_payments sp
LEFT JOIN merchant_subscription_refunds r ON r.payment_id = sp.id
WHERE UPPER(sp.payment_status::text) IN ('REFUNDED', 'REFUND_PENDING')
  AND UPPER(sp.payment_gateway::text) IN ('WALLET', 'RAZORPAY')
  AND sp.amount > 0
  AND r.id IS NULL
ON CONFLICT (payment_id) DO NOTHING;
