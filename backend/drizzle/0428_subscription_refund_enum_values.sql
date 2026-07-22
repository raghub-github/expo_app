-- ─────────────────────────────────────────────────────────────────────────────
-- 0428 · Add the refund-flow enum values the admin refund path relies on
--
-- The admin refund path (refundMerchantSubscriptionPayment) and the Razorpay
-- refund webhook write two status values that were NEVER added to their enums:
--
--   • subscription_payments.payment_status = 'REFUND_PENDING'
--       type subscription_payment_status_type had only PENDING/PAID/FAILED/REFUNDED
--   • merchant_subscriptions.subscription_status = 'REFUNDED'
--       type subscription_status_type had only ACTIVE/INACTIVE/EXPIRED/CANCELLED/
--       PENDING_PAYMENT/UPGRADED
--
-- Result: a RAZORPAY refund filed the money at Razorpay successfully, then the
-- very next UPDATE threw 22P02 (invalid input value for enum ...) → the admin got
-- a 500 even though the money WAS refunded (the webhook, which sets the valid
-- 'REFUNDED', later reconciled the payment row). WALLET refunds hit the same
-- 'REFUNDED' subscription_status crash.
--
-- Adding the values makes the existing code work as designed (webhook flips
-- REFUND_PENDING → REFUNDED; idempotency + history filters key off these).
-- IF NOT EXISTS = safe to re-run. ADD VALUE only adds — it never uses the value
-- in this transaction, so it is safe under the migration runner.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE subscription_payment_status_type ADD VALUE IF NOT EXISTS 'REFUND_PENDING';
ALTER TYPE subscription_status_type          ADD VALUE IF NOT EXISTS 'REFUNDED';
