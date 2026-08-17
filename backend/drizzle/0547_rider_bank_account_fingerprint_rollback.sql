DROP INDEX IF EXISTS public.rider_payment_methods_rider_acct_fp_uidx;

ALTER TABLE public.rider_payment_methods
  DROP COLUMN IF EXISTS account_number_fingerprint;
