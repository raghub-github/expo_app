-- GMitra Max: wallet-based subscription, auto-renewal dues, dispatch restriction

DO $$ BEGIN
  ALTER TYPE public.wallet_entry_type ADD VALUE IF NOT EXISTS 'subscription_fee';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS subscription_dues_outstanding NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_dispatch_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subscription_dispatch_blocked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS subscription_negative_since TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_rider_income_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.riders.subscription_dues_outstanding IS
  'Subscription fees not debited because wallet hit -₹35 subscription floor.';
COMMENT ON COLUMN public.riders.subscription_dispatch_blocked IS
  'When true, rider cannot receive new dispatch offers until subscription dues are cleared.';
COMMENT ON COLUMN public.riders.last_rider_income_at IS
  'Last wallet earning credit — used for 3-day income freeze restriction rule.';

CREATE INDEX IF NOT EXISTS riders_subscription_dispatch_blocked_idx
  ON public.riders (subscription_dispatch_blocked)
  WHERE subscription_dispatch_blocked = TRUE;
