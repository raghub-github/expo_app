-- Rollback 0429 · drop the unique constraint (deduped rows are not restored).
ALTER TABLE merchant_subscription_refunds
  DROP CONSTRAINT IF EXISTS merchant_subscription_refunds_payment_id_uq;
