-- =============================================================================
-- Allow negative balance in wallet_ledger (and thus rider_wallet via trigger).
-- Business: Rider balance can go negative due to:
--   - Penalties applied when balance is low/zero
--   - COD (cash on delivery) shortfall or recovery entries
--   - Other adjustments (reversals, chargebacks, special deductions)
-- amount column remains >= 0 (absolute value); entry_type gives direction.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'wallet_ledger'
      AND constraint_name = 'wallet_ledger_balance_non_negative'
  ) THEN
    ALTER TABLE wallet_ledger
      DROP CONSTRAINT wallet_ledger_balance_non_negative;
  END IF;
END $$;

COMMENT ON COLUMN wallet_ledger.balance IS 'Running balance after this entry. Can be negative (e.g. after penalty when balance was low, COD shortfall, or other deductions).';
