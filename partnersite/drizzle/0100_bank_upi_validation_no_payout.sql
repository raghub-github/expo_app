-- Real-time Bank & UPI verification (Razorpay Fund Account Validation API, no money transfer).
-- Preserves existing merchant_store_bank_accounts data; adds columns and new tables.

-- 1) merchant_store_bank_accounts: add columns for validation-only flow
ALTER TABLE public.merchant_store_bank_accounts
  ADD COLUMN IF NOT EXISTS beneficiary_name TEXT,
  ADD COLUMN IF NOT EXISTS verification_response JSONB,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS razorpay_validation_id TEXT;

COMMENT ON COLUMN public.merchant_store_bank_accounts.beneficiary_name IS 'Name returned by bank/UPI validation (Razorpay registered_name).';
COMMENT ON COLUMN public.merchant_store_bank_accounts.verification_response IS 'Full Razorpay validation response JSON for audit.';
COMMENT ON COLUMN public.merchant_store_bank_accounts.attempt_count IS 'Number of verification attempts for this account.';
COMMENT ON COLUMN public.merchant_store_bank_accounts.last_attempt_at IS 'Timestamp of last verification attempt.';
COMMENT ON COLUMN public.merchant_store_bank_accounts.razorpay_validation_id IS 'Razorpay fund_account.validation id (fav_xxx).';

-- Ensure verification_status allows pending, verified, failed (already text default pending)
-- No enum change; keep as text.

-- 2) merchant_store_upi_accounts: UPI IDs verified via VPA validation (no payout)
CREATE TABLE IF NOT EXISTS public.merchant_store_upi_accounts (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  upi_id TEXT NOT NULL,
  holder_name TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'failed')),
  verification_response JSONB,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  razorpay_contact_id TEXT,
  razorpay_fund_account_id TEXT,
  razorpay_validation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.merchant_store_upi_accounts IS 'UPI IDs verified via Razorpay VPA validation (no money transfer).';
CREATE INDEX IF NOT EXISTS merchant_store_upi_accounts_store_id_idx ON public.merchant_store_upi_accounts(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_upi_accounts_upi_id_idx ON public.merchant_store_upi_accounts(store_id, upi_id);
CREATE UNIQUE INDEX IF NOT EXISTS merchant_store_upi_accounts_store_upi_unique ON public.merchant_store_upi_accounts(store_id, LOWER(upi_id));

-- 3) merchant_verification_limits: per-store daily attempt limits (reset by cron)
CREATE TABLE IF NOT EXISTS public.merchant_verification_limits (
  store_id BIGINT NOT NULL PRIMARY KEY REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  bank_attempts_today INTEGER NOT NULL DEFAULT 0,
  upi_attempts_today INTEGER NOT NULL DEFAULT 0,
  last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE
);

COMMENT ON TABLE public.merchant_verification_limits IS 'Daily verification attempt counters; reset when last_reset_date < current date.';

-- 4) merchant_verification_attempts: audit log for every verification attempt (no payout)
CREATE TABLE IF NOT EXISTS public.merchant_verification_attempts (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  merchant_parent_id BIGINT NOT NULL REFERENCES public.merchant_parents(id) ON DELETE RESTRICT,
  attempt_type TEXT NOT NULL CHECK (attempt_type IN ('bank', 'upi')),
  bank_account_id BIGINT REFERENCES public.merchant_store_bank_accounts(id) ON DELETE SET NULL,
  upi_account_id BIGINT REFERENCES public.merchant_store_upi_accounts(id) ON DELETE SET NULL,
  razorpay_validation_id TEXT,
  status TEXT NOT NULL,
  verification_response JSONB,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE public.merchant_verification_attempts IS 'Audit log for every bank/UPI verification attempt (Razorpay validation, no payout).';
CREATE INDEX IF NOT EXISTS merchant_verification_attempts_store_id_idx ON public.merchant_verification_attempts(store_id);
CREATE INDEX IF NOT EXISTS merchant_verification_attempts_attempted_at_idx ON public.merchant_verification_attempts(attempted_at DESC);
CREATE INDEX IF NOT EXISTS merchant_verification_attempts_parent_attempted_idx ON public.merchant_verification_attempts(merchant_parent_id, attempted_at);
