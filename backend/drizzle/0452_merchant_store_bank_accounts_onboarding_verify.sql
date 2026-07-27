-- ============================================================================
-- 0452_merchant_store_bank_accounts_onboarding_verify
-- Mirror of dashboard/drizzle/0452_merchant_store_bank_accounts_onboarding_verify.sql
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.merchant_store_bank_accounts') IS NULL THEN
    RAISE NOTICE 'merchant_store_bank_accounts missing — skip 0452';
    RETURN;
  END IF;

  ALTER TABLE public.merchant_store_bank_accounts
    ADD COLUMN IF NOT EXISTS payout_method text NULL,
    ADD COLUMN IF NOT EXISTS bank_proof_type text NULL,
    ADD COLUMN IF NOT EXISTS bank_proof_file_url text NULL,
    ADD COLUMN IF NOT EXISTS upi_qr_screenshot_url text NULL,
    ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS verification_status text NULL;

  ALTER TABLE public.merchant_store_bank_accounts
    ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS verified_by integer NULL,
    ADD COLUMN IF NOT EXISTS verified_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS verification_method text NULL,
    ADD COLUMN IF NOT EXISTS upi_id text NULL,
    ADD COLUMN IF NOT EXISTS upi_verified boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS bank_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

  BEGIN
    ALTER TABLE public.merchant_store_bank_accounts
      ALTER COLUMN account_number DROP NOT NULL;
  EXCEPTION WHEN others THEN
    NULL;
  END;
  BEGIN
    ALTER TABLE public.merchant_store_bank_accounts
      ALTER COLUMN ifsc_code DROP NOT NULL;
  EXCEPTION WHEN others THEN
    NULL;
  END;
  BEGIN
    ALTER TABLE public.merchant_store_bank_accounts
      ALTER COLUMN bank_name DROP NOT NULL;
  EXCEPTION WHEN others THEN
    NULL;
  END;
END $$;

COMMENT ON COLUMN public.merchant_store_bank_accounts.payout_method IS
  'bank | upi — payout channel chosen during onboarding';
COMMENT ON COLUMN public.merchant_store_bank_accounts.bank_proof_type IS
  'passbook | cancelled_cheque | bank_statement (manual evidence)';
COMMENT ON COLUMN public.merchant_store_bank_accounts.verification_method IS
  'CASHFREE_AUTO | DOCUMENT | MANUAL | AGENT | PENNY_DROP | UPI_PENNY_DROP';
COMMENT ON COLUMN public.merchant_store_bank_accounts.bank_metadata IS
  'Provider payloads incl. auto_verification.verified_data for bank/UPI';
COMMENT ON COLUMN public.merchant_store_bank_accounts.upi_verified IS
  'True when UPI VPA was auto-verified (Cashfree UPI penny drop / validate)';

UPDATE public.merchant_store_bank_accounts
SET payout_method = CASE
  WHEN payout_method IS NOT NULL AND BTRIM(payout_method) <> '' THEN lower(payout_method)
  WHEN upi_id IS NOT NULL AND BTRIM(upi_id) <> '' THEN 'upi'
  ELSE 'bank'
END
WHERE payout_method IS NULL
   OR BTRIM(payout_method) = '';

CREATE INDEX IF NOT EXISTS merchant_store_bank_accounts_payout_method_idx
  ON public.merchant_store_bank_accounts (store_id, payout_method);

CREATE INDEX IF NOT EXISTS merchant_store_bank_accounts_upi_verified_idx
  ON public.merchant_store_bank_accounts (store_id)
  WHERE upi_verified = TRUE;
