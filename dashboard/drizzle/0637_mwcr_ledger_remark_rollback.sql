-- Rollback 0637 (I/O-safe): drop only if present.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchant_wallet_credit_requests'
      AND column_name = 'approved_amount'
  ) THEN
    ALTER TABLE merchant_wallet_credit_requests DROP COLUMN approved_amount;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchant_wallet_credit_requests'
      AND column_name = 'ledger_remark'
  ) THEN
    ALTER TABLE merchant_wallet_credit_requests DROP COLUMN ledger_remark;
  END IF;
END $$;
