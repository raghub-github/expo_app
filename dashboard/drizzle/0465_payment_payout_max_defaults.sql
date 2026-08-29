-- Mirror: ensure merchant default payout rule has a max.
UPDATE public.payment_payout_rules
SET
  max_payout_amount = COALESCE(max_payout_amount, 100000),
  updated_at = NOW()
WHERE party_type = 'MERCHANT'
  AND is_active = TRUE
  AND (max_payout_amount IS NULL OR max_payout_amount <= 0);
