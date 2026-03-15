-- Track who initiated each withdrawal request (merchant user).
-- Run after merchant_wallet / merchant_payout_requests exist.

ALTER TABLE public.merchant_payout_requests
  ADD COLUMN IF NOT EXISTS requested_by_id uuid,
  ADD COLUMN IF NOT EXISTS requested_by_email text;

COMMENT ON COLUMN public.merchant_payout_requests.requested_by_id IS 'Supabase auth user id of the merchant who requested the withdrawal.';
COMMENT ON COLUMN public.merchant_payout_requests.requested_by_email IS 'Email of the user who requested the withdrawal (denormalized for display).';

CREATE INDEX IF NOT EXISTS merchant_payout_requests_requested_by_id_idx
  ON public.merchant_payout_requests(requested_by_id) WHERE requested_by_id IS NOT NULL;
