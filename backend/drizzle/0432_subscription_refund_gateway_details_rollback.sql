-- Rollback 0432 · drop the added columns + unique index, restore the plain index.
DROP INDEX IF EXISTS merchant_subscription_refunds_razorpay_refund_uq;

CREATE INDEX IF NOT EXISTS merchant_subscription_refunds_razorpay_refund_idx
  ON merchant_subscription_refunds (razorpay_refund_id)
  WHERE razorpay_refund_id IS NOT NULL;

ALTER TABLE merchant_subscription_refunds
  DROP COLUMN IF EXISTS gateway_response,
  DROP COLUMN IF EXISTS refund_notes,
  DROP COLUMN IF EXISTS last_refund_sync_at;
