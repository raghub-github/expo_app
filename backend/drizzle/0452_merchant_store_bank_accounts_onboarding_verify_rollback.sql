-- Rollback 0452_merchant_store_bank_accounts_onboarding_verify

DO $$
BEGIN
  IF to_regclass('public.merchant_store_bank_accounts') IS NULL THEN
    RETURN;
  END IF;

  DROP INDEX IF EXISTS public.merchant_store_bank_accounts_payout_method_idx;
  DROP INDEX IF EXISTS public.merchant_store_bank_accounts_upi_verified_idx;

  ALTER TABLE public.merchant_store_bank_accounts
    DROP COLUMN IF EXISTS payout_method,
    DROP COLUMN IF EXISTS bank_proof_type,
    DROP COLUMN IF EXISTS bank_proof_file_url,
    DROP COLUMN IF EXISTS upi_qr_screenshot_url,
    DROP COLUMN IF EXISTS is_disabled,
    DROP COLUMN IF EXISTS verification_status;
END $$;
