-- Rollback for 0420_merchant_subscription_refunds_audit.sql.
-- Drops the audit table + trigger + function. Refund action still works
-- (the refund itself lives in wallet_ledger / Razorpay); only the
-- immutable audit trail from the Control Dashboard would be lost.
DROP TRIGGER IF EXISTS trg_touch_merchant_subscription_refunds_updated_at
  ON merchant_subscription_refunds;
DROP FUNCTION IF EXISTS touch_merchant_subscription_refunds_updated_at();
DROP TABLE IF EXISTS merchant_subscription_refunds;
