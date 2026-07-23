-- ─────────────────────────────────────────────────────────────────────────────
-- 0432 · Persist full Razorpay refund details for a fully-auditable, idempotent
--        subscription refund lifecycle
--
-- merchant_subscription_refunds already stores most of the required fields:
--   razorpay_refund_id, initiated_at (= refund_requested_at), completed_at
--   (= refund_completed_at), status (= refund_status), amount (= refund_amount),
--   reason (= refund_reason), failure_reason (= refund_failure_reason), failed_at,
--   plus UNIQUE(payment_id) (one refund per payment → idempotent) and an index on
--   razorpay_refund_id.
--
-- This migration adds the three remaining fields:
--   • gateway_response    — the raw Razorpay refund object (audit / debugging)
--   • refund_notes        — free-form operational notes attached to the refund
--   • last_refund_sync_at — when we last reconciled status with Razorpay (webhook)
--
-- and upgrades the razorpay_refund_id index to UNIQUE so a duplicate webhook /
-- retry can never create a second row for the same gateway refund.
-- All additive + IF NOT EXISTS → safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE merchant_subscription_refunds
  ADD COLUMN IF NOT EXISTS gateway_response    jsonb,
  ADD COLUMN IF NOT EXISTS refund_notes        text,
  ADD COLUMN IF NOT EXISTS last_refund_sync_at timestamptz;

-- Idempotency: at most one audit row per Razorpay refund id. Replaces the plain
-- (non-unique) index with a unique partial one. Dedupe first (defensive).
DELETE FROM merchant_subscription_refunds a
USING merchant_subscription_refunds b
WHERE a.razorpay_refund_id IS NOT NULL
  AND a.razorpay_refund_id = b.razorpay_refund_id
  AND a.id > b.id;

DROP INDEX IF EXISTS merchant_subscription_refunds_razorpay_refund_idx;

CREATE UNIQUE INDEX IF NOT EXISTS merchant_subscription_refunds_razorpay_refund_uq
  ON merchant_subscription_refunds (razorpay_refund_id)
  WHERE razorpay_refund_id IS NOT NULL;
