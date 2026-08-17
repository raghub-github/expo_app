-- Fingerprint for unique account-number checks (rejected rows stay; same acct # blocked).
ALTER TABLE public.rider_payment_methods
  ADD COLUMN IF NOT EXISTS account_number_fingerprint text;

-- One account number per rider (including rejected / inactive history).
CREATE UNIQUE INDEX IF NOT EXISTS rider_payment_methods_rider_acct_fp_uidx
  ON public.rider_payment_methods (rider_id, account_number_fingerprint)
  WHERE method_type = 'bank'
    AND account_number_fingerprint IS NOT NULL;
