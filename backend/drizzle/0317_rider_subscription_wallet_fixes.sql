-- GMitra Max subscription fixes:
-- 1) Allow negative running balance in wallet_ledger (subscription -₹35 policy)
-- 2) Ensure subscription_fee enum exists
-- 3) Backfill next_deduction_at for active auto-renew subscriptions

DO $$ BEGIN
  ALTER TYPE public.wallet_entry_type ADD VALUE IF NOT EXISTS 'subscription_fee';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.wallet_ledger
  DROP CONSTRAINT IF EXISTS wallet_ledger_balance_non_negative;

-- Amount must remain >= 0; debits use positive amount + entry_type direction.

UPDATE public.rider_subscriptions rs
SET
  next_deduction_at = rs.end_date,
  updated_at = NOW()
WHERE rs.status = 'active'
  AND rs.end_date > NOW()
  AND rs.auto_wallet_deduction = TRUE
  AND rs.next_deduction_at IS NULL;

-- Active plans without auto-renew still get expiry-aligned next_deduction for UI display.
UPDATE public.rider_subscriptions rs
SET
  next_deduction_at = rs.end_date,
  updated_at = NOW()
WHERE rs.status = 'active'
  AND rs.end_date > NOW()
  AND rs.next_deduction_at IS NULL;

COMMENT ON COLUMN public.rider_subscriptions.next_deduction_at IS
  'Next wallet auto-debit time when auto_wallet_deduction is enabled; defaults to end_date.';
