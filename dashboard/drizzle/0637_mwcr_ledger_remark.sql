-- I/O-safe / idempotent: ADD COLUMN only when missing; safe to re-run.
-- Separates agent request remark (`reason`) from admin ledger remark.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchant_wallet_credit_requests'
      AND column_name = 'ledger_remark'
  ) THEN
    ALTER TABLE merchant_wallet_credit_requests
      ADD COLUMN ledger_remark TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchant_wallet_credit_requests'
      AND column_name = 'approved_amount'
  ) THEN
    ALTER TABLE merchant_wallet_credit_requests
      ADD COLUMN approved_amount NUMERIC(14, 2);
  END IF;
END $$;

COMMENT ON COLUMN merchant_wallet_credit_requests.reason IS
  'Agent request remark at submit time. Displayed on request records only — never copied to merchant_wallet_ledger.description.';

COMMENT ON COLUMN merchant_wallet_credit_requests.ledger_remark IS
  'Admin ledger remark entered when approving. This is the description written to merchant_wallet_ledger.';

COMMENT ON COLUMN merchant_wallet_credit_requests.approved_amount IS
  'Amount applied on approve. NULL until approved; may differ from requested amount.';

COMMENT ON COLUMN merchant_wallet_credit_requests.review_note IS
  'Admin reject / internal note. Not used as merchant_wallet_ledger.description.';
