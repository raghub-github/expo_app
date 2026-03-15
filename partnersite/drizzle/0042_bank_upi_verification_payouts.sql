-- Bank/UPI verification: track ₹1 verification payouts and enforce 3 attempts per day per merchant.
-- Razorpay: contact + fund account + payout. We record each attempt here.

CREATE TABLE IF NOT EXISTS public.merchant_bank_verification_payouts (
  id BIGSERIAL PRIMARY KEY,

  -- Who / which store
  merchant_parent_id BIGINT NOT NULL REFERENCES public.merchant_parents(id) ON DELETE RESTRICT,
  merchant_store_id BIGINT NOT NULL REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  bank_account_id BIGINT REFERENCES public.merchant_store_bank_accounts(id) ON DELETE SET NULL,

  -- Type and amount
  account_type TEXT NOT NULL CHECK (account_type IN ('bank', 'upi')),
  amount_paise INTEGER NOT NULL DEFAULT 100 CHECK (amount_paise >= 0),

  -- Beneficiary (snapshot at attempt time)
  beneficiary_name TEXT NOT NULL,
  account_number_masked TEXT,
  ifsc_code TEXT,
  bank_name TEXT,
  upi_id TEXT,

  -- Razorpay
  razorpay_contact_id TEXT,
  razorpay_fund_account_id TEXT,
  razorpay_payout_id TEXT UNIQUE,
  razorpay_status TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'success', 'failed', 'reversed')),

  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE public.merchant_bank_verification_payouts IS '₹1 verification payouts for bank/UPI; used to enforce 3 attempts per day and audit.';

CREATE INDEX IF NOT EXISTS merchant_bank_verification_payouts_merchant_parent_id_idx
  ON public.merchant_bank_verification_payouts(merchant_parent_id);
CREATE INDEX IF NOT EXISTS merchant_bank_verification_payouts_merchant_store_id_idx
  ON public.merchant_bank_verification_payouts(merchant_store_id);
CREATE INDEX IF NOT EXISTS merchant_bank_verification_payouts_bank_account_id_idx
  ON public.merchant_bank_verification_payouts(bank_account_id)
  WHERE bank_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_bank_verification_payouts_attempted_at_idx
  ON public.merchant_bank_verification_payouts(attempted_at DESC);
CREATE INDEX IF NOT EXISTS merchant_bank_verification_payouts_status_idx
  ON public.merchant_bank_verification_payouts(status);
-- Count attempts per parent per day (for 3/day limit; query uses attempted_at range)
CREATE INDEX IF NOT EXISTS merchant_bank_verification_payouts_parent_attempted_idx
  ON public.merchant_bank_verification_payouts(merchant_parent_id, attempted_at);

-- Optional: link bank account to Razorpay fund account for idempotent payouts
ALTER TABLE public.merchant_store_bank_accounts
  ADD COLUMN IF NOT EXISTS razorpay_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_fund_account_id TEXT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending';
COMMENT ON COLUMN public.merchant_store_bank_accounts.razorpay_contact_id IS 'Razorpay contact ID for payouts';
COMMENT ON COLUMN public.merchant_store_bank_accounts.razorpay_fund_account_id IS 'Razorpay fund account ID';
COMMENT ON COLUMN public.merchant_store_bank_accounts.verification_status IS 'pending | verified | failed';
