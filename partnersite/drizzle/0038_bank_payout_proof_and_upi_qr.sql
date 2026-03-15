-- Add columns to merchant_store_bank_accounts for payout proof (bank) or UPI QR screenshot.
-- payout_method: 'bank' | 'upi' (user selects one).
-- For bank: bank_proof_type (passbook | cancelled_cheque | bank_statement), bank_proof_file_url.
-- For UPI: upi_qr_screenshot_url (screenshot where UPI ID is clearly visible).

ALTER TABLE public.merchant_store_bank_accounts
  ADD COLUMN IF NOT EXISTS payout_method text,
  ADD COLUMN IF NOT EXISTS bank_proof_type text,
  ADD COLUMN IF NOT EXISTS bank_proof_file_url text,
  ADD COLUMN IF NOT EXISTS upi_qr_screenshot_url text;

COMMENT ON COLUMN public.merchant_store_bank_accounts.payout_method IS 'bank or upi';
COMMENT ON COLUMN public.merchant_store_bank_accounts.bank_proof_type IS 'passbook, cancelled_cheque, or bank_statement';
COMMENT ON COLUMN public.merchant_store_bank_accounts.bank_proof_file_url IS 'Signed URL for uploaded passbook/cheque/statement';
COMMENT ON COLUMN public.merchant_store_bank_accounts.upi_qr_screenshot_url IS 'Signed URL for UPI QR screenshot with visible UPI ID';
