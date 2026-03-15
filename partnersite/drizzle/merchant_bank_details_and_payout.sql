-- ============================================================================
-- MERCHANT BANK DETAILS & PAYOUT – Schema improvements
-- - Bank/UPI: can disable but never remove; one default per store; attachments in R2
-- - Payout requests: FK to bank_account_id; pending withdrawal reporting
-- ============================================================================

-- 1. merchant_store_bank_accounts: ensure is_disabled and default semantics
--    (use is_active for "enabled"; when false = disabled, row is never deleted)
ALTER TABLE public.merchant_store_bank_accounts
  ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.merchant_store_bank_accounts.is_disabled IS 'When true, account cannot be used for new payouts. Row is never deleted for audit.';

-- Ensure exactly one default (is_primary) per store: use unique partial index
DROP INDEX IF EXISTS public.merchant_store_bank_accounts_one_primary_per_store;
CREATE UNIQUE INDEX merchant_store_bank_accounts_one_primary_per_store
  ON public.merchant_store_bank_accounts(store_id)
  WHERE is_primary = true;

-- Optional: R2 key for attachment (if you store key separately from URL)
ALTER TABLE public.merchant_store_bank_accounts
  ADD COLUMN IF NOT EXISTS bank_proof_r2_key TEXT,
  ADD COLUMN IF NOT EXISTS upi_qr_r2_key TEXT;

COMMENT ON COLUMN public.merchant_store_bank_accounts.bank_proof_r2_key IS 'R2 object key for bank proof (passbook/cheque/statement).';
COMMENT ON COLUMN public.merchant_store_bank_accounts.upi_qr_r2_key IS 'R2 object key for UPI QR screenshot.';

-- 2. merchant_payout_requests: add FK to merchant_store_bank_accounts if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'merchant_payout_requests'
    AND constraint_name = 'merchant_payout_requests_bank_account_id_fkey'
  ) THEN
    ALTER TABLE public.merchant_payout_requests
      ADD CONSTRAINT merchant_payout_requests_bank_account_id_fkey
      FOREIGN KEY (bank_account_id) REFERENCES public.merchant_store_bank_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Index for pending withdrawal sum by wallet
CREATE INDEX IF NOT EXISTS merchant_payout_requests_wallet_status_pending_idx
  ON public.merchant_payout_requests(wallet_id, status)
  WHERE status = 'PENDING';

-- 4. Trigger: when setting is_primary = true for one row, unset others for same store
CREATE OR REPLACE FUNCTION public.merchant_store_bank_accounts_set_primary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE public.merchant_store_bank_accounts
    SET is_primary = false, updated_at = NOW()
    WHERE store_id = NEW.store_id AND id <> NEW.id;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_store_bank_accounts_set_primary_trigger ON public.merchant_store_bank_accounts;
CREATE TRIGGER merchant_store_bank_accounts_set_primary_trigger
  BEFORE INSERT OR UPDATE OF is_primary ON public.merchant_store_bank_accounts
  FOR EACH ROW
  WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION public.merchant_store_bank_accounts_set_primary();

-- 5. Backfill is_disabled from is_active (inverse: disabled = not active)
UPDATE public.merchant_store_bank_accounts
SET is_disabled = COALESCE((is_active = false), false)
WHERE is_disabled IS DISTINCT FROM COALESCE((is_active = false), false);
