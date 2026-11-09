-- Post-paid settlement engine: one settlement record per completed Person Ride
-- OR Parcel, a minimum-wallet-balance policy, and the ledger vocabulary the
-- ride engine already writes.
-- Additive only, safe to re-run. Historical rows are untouched.

SET lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- 1) ride_settlement_ledger CHECKs: the engine already posts these values (toll
--    pass-through, company pickup incentive, the #324 promotion subsidy), but the
--    0463 constraints never allowed them. The whole settlement is one transaction,
--    so the first discounted / tolled ride would fail to settle at all.
--    Widened to a superset; nothing that was valid becomes invalid.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ride_settlement_ledger
  DROP CONSTRAINT IF EXISTS ride_settlement_ledger_account_kind_check;
ALTER TABLE public.ride_settlement_ledger
  ADD CONSTRAINT ride_settlement_ledger_account_kind_check CHECK (account_kind = ANY (ARRAY[
    'rider_wallet', 'customer_cash', 'gateway_online', 'gati_cash',
    'company_receivable', 'company_revenue', 'company_commission', 'company_tax',
    'company_platform_fee', 'company_convenience_fee', 'company_service_charge',
    'company_gateway_fee', 'company_surge_share', 'company_discount_subsidy',
    'rider_earning_kept', 'rider_earning_credited',
    -- written by rideSettlement.engine.ts since #213/#324, never allowed until now
    'company_pickup_incentive', 'rider_toll_passthrough', 'company_rider_promotion_subsidy',
    -- post-paid settlement engine (rides + parcels)
    'rider_tip', 'company_rider_incentive'
  ]::text[]));

ALTER TABLE public.ride_settlement_ledger
  DROP CONSTRAINT IF EXISTS ride_settlement_ledger_reason_code_check;
ALTER TABLE public.ride_settlement_ledger
  ADD CONSTRAINT ride_settlement_ledger_reason_code_check CHECK (reason_code = ANY (ARRAY[
    'RIDE_EARNING_CREDIT', 'RIDE_EARNING_KEPT_IN_CASH', 'CASH_COMPANY_RECOVERY',
    'COMMISSION', 'TAX', 'PLATFORM_FEE', 'CONVENIENCE_FEE', 'SERVICE_CHARGE',
    'GATEWAY_FEE', 'SURGE_CUSTOMER', 'SURGE_COMPANY', 'DISCOUNT',
    'CUSTOMER_ONLINE_PAY', 'CUSTOMER_GATI_CASH_PAY', 'CUSTOMER_CASH_PAY',
    'REFUND', 'ADJUSTMENT',
    'PICKUP_INCENTIVE_COMPANY', 'TOLL', 'RIDER_PROMO_SUBSIDY',
    'CASH_SETTLEMENT_CREDIT', 'PARCEL_EARNING_CREDIT', 'PARCEL_EARNING_KEPT_IN_CASH',
    'RIDER_TIP', 'RIDER_INCENTIVE'
  ]::text[]));

-- ---------------------------------------------------------------------------
-- 2) ride_settlements becomes the post-paid settlement record for both services.
--    Existing rows are all rides, so the default is exactly right for them.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ride_settlements
  ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'person_ride',
  ADD COLUMN IF NOT EXISTS cash_collected numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promotion_subsidy numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tip_amount numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incentive_amount numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_balance_before numeric(12, 2),
  ADD COLUMN IF NOT EXISTS wallet_balance_after numeric(12, 2),
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS reconciliation_reason text,
  ADD COLUMN IF NOT EXISTS reconciliation_flagged_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ride_settlements_service_type_check') THEN
    ALTER TABLE public.ride_settlements
      ADD CONSTRAINT ride_settlements_service_type_check
      CHECK (service_type IN ('person_ride', 'parcel'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ride_settlements_reconciliation_status_check') THEN
    ALTER TABLE public.ride_settlements
      ADD CONSTRAINT ride_settlements_reconciliation_status_check
      CHECK (reconciliation_status IN ('none', 'required', 'resolved'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ride_settlements_service_posted_idx
  ON public.ride_settlements (service_type, posted_at DESC);
CREATE INDEX IF NOT EXISTS ride_settlements_reconciliation_idx
  ON public.ride_settlements (reconciliation_flagged_at DESC)
  WHERE reconciliation_status = 'required';

COMMENT ON COLUMN public.ride_settlements.service_type IS
  'person_ride | parcel — both settle through lib/postpaid-settlement.ts';
COMMENT ON COLUMN public.ride_settlements.cash_collected IS
  'Customer cash the rider holds for this job. Recorded here, never credited to the wallet.';
COMMENT ON COLUMN public.ride_settlements.reconciliation_status IS
  'none | required | resolved — required when a refund/adjustment after settlement needs an admin decision';

-- ---------------------------------------------------------------------------
-- 3) Wallet idempotency for settlement debits. Credits already reuse the unique
--    rider_earn:delivery:<id> ref; the cash debit refs had no unique guard.
--    wallet_ledger is HASH-partitioned by rider_id, so rider_id must be in the key.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_rider_settlement_debit_ref_uidx
  ON public.wallet_ledger (rider_id, ref)
  WHERE ref IS NOT NULL AND ref ~ '^parcel_cash_settle:[0-9]+$';

-- ---------------------------------------------------------------------------
-- 4) Minimum wallet balance policy (₹200 operational minimum, configurable).
--    off     — ignored
--    warn    — rider sees the shortfall and can recharge; dispatch unaffected
--    enforce — new Ride + Parcel assignments stop until the balance is restored
--    Seeded as 'warn' so riders can top up before it starts blocking anyone.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ride_wallet_config
  ADD COLUMN IF NOT EXISTS min_wallet_balance numeric(10, 2) NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS min_balance_mode text NOT NULL DEFAULT 'warn';
ALTER TABLE public.ride_wallet_config_history
  ADD COLUMN IF NOT EXISTS commission_on_toll boolean,
  ADD COLUMN IF NOT EXISTS min_wallet_balance numeric(10, 2),
  ADD COLUMN IF NOT EXISTS min_balance_mode text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ride_wallet_config_min_balance_mode_check') THEN
    ALTER TABLE public.ride_wallet_config
      ADD CONSTRAINT ride_wallet_config_min_balance_mode_check
      CHECK (min_balance_mode IN ('off', 'warn', 'enforce'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ride_wallet_config_min_wallet_balance_check') THEN
    ALTER TABLE public.ride_wallet_config
      ADD CONSTRAINT ride_wallet_config_min_wallet_balance_check
      CHECK (min_wallet_balance >= 0);
  END IF;
END $$;

RESET lock_timeout;
