-- ============================================================================
-- Wallet & Ledger: Extended entry types and actor tracking
-- Migration: 0066_wallet_ledger_entry_types_and_actor
--
-- 1. Extend wallet_entry_type enum with all credit/debit types for accurate
--    rider wallet: credits (order delivery, cancellation payout, bonus,
--    incentive, surge, failed withdrawal revert, penalty reversal, manual add)
--    and debits (withdrawal, subscription_fee, purchase, cod_order, manual deduct, other).
-- 2. Add performed_by_type and performed_by_id to wallet_ledger for audit
--    (agent, system, rider, automated).
-- 3. Update trigger/function so every entry type updates rider_wallet correctly;
--    wallet balance can be negative, zero, or positive.
--
-- CREDITS (add to total_balance): earning, refund, bonus, referral_bonus,
--   incentive, surge, failed_withdrawal_revert, penalty_reversal,
--   cancellation_payout, manual_add
-- DEBITS (subtract from total_balance): penalty, onboarding_fee, withdrawal,
--   subscription_fee, purchase, cod_order, manual_deduct, other
-- (adjustment: treat as credit if amount > 0, debit if amount < 0 for backward compat)
-- ============================================================================

-- Add new enum values to wallet_entry_type (one at a time; cannot add in batch in older PG)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'wallet_entry_type' AND e.enumlabel = 'withdrawal') THEN
    ALTER TYPE wallet_entry_type ADD VALUE 'withdrawal';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'wallet_entry_type' AND e.enumlabel = 'subscription_fee') THEN
    ALTER TYPE wallet_entry_type ADD VALUE 'subscription_fee';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'wallet_entry_type' AND e.enumlabel = 'purchase') THEN
    ALTER TYPE wallet_entry_type ADD VALUE 'purchase';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'wallet_entry_type' AND e.enumlabel = 'cod_order') THEN
    ALTER TYPE wallet_entry_type ADD VALUE 'cod_order';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'wallet_entry_type' AND e.enumlabel = 'other') THEN
    ALTER TYPE wallet_entry_type ADD VALUE 'other';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'wallet_entry_type' AND e.enumlabel = 'incentive') THEN
    ALTER TYPE wallet_entry_type ADD VALUE 'incentive';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'wallet_entry_type' AND e.enumlabel = 'surge') THEN
    ALTER TYPE wallet_entry_type ADD VALUE 'surge';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'wallet_entry_type' AND e.enumlabel = 'failed_withdrawal_revert') THEN
    ALTER TYPE wallet_entry_type ADD VALUE 'failed_withdrawal_revert';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'wallet_entry_type' AND e.enumlabel = 'penalty_reversal') THEN
    ALTER TYPE wallet_entry_type ADD VALUE 'penalty_reversal';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'wallet_entry_type' AND e.enumlabel = 'cancellation_payout') THEN
    ALTER TYPE wallet_entry_type ADD VALUE 'cancellation_payout';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'wallet_entry_type' AND e.enumlabel = 'manual_add') THEN
    ALTER TYPE wallet_entry_type ADD VALUE 'manual_add';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'wallet_entry_type' AND e.enumlabel = 'manual_deduct') THEN
    ALTER TYPE wallet_entry_type ADD VALUE 'manual_deduct';
  END IF;
END $$;

-- Add actor tracking columns to wallet_ledger
ALTER TABLE wallet_ledger
  ADD COLUMN IF NOT EXISTS performed_by_type TEXT DEFAULT 'system',  -- 'agent' | 'system' | 'rider' | 'automated'
  ADD COLUMN IF NOT EXISTS performed_by_id INTEGER REFERENCES system_users(id) ON DELETE SET NULL;  -- agent/user who performed (when performed_by_type = 'agent')

CREATE INDEX IF NOT EXISTS wallet_ledger_performed_by_type_idx ON wallet_ledger(performed_by_type) WHERE performed_by_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS wallet_ledger_performed_by_id_idx ON wallet_ledger(performed_by_id) WHERE performed_by_id IS NOT NULL;

COMMENT ON COLUMN wallet_ledger.performed_by_type IS 'Who performed the action: agent (dashboard), system, rider, automated.';
COMMENT ON COLUMN wallet_ledger.performed_by_id IS 'System user ID when performed_by_type = agent (for audit).';

-- ============================================================================
-- Update trigger function: classify all entry types as credit or debit and
-- update rider_wallet (total_balance, service-specific earnings/penalties, total_withdrawn).
-- Amount in ledger is stored as positive; direction is implied by entry_type.
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_update_wallet_from_ledger()
RETURNS TRIGGER AS $$
DECLARE
  delta_balance NUMERIC;
  is_credit BOOLEAN;
BEGIN
  -- Classify entry type: credits add to balance, debits subtract
  is_credit := NEW.entry_type::TEXT IN (
    'earning', 'refund', 'bonus', 'referral_bonus', 'incentive', 'surge',
    'failed_withdrawal_revert', 'penalty_reversal', 'cancellation_payout', 'manual_add'
  );
  IF NEW.entry_type::TEXT = 'adjustment' THEN
    is_credit := NEW.amount >= 0;
  END IF;

  IF is_credit THEN
    delta_balance := ABS(NEW.amount);
  ELSE
    delta_balance := -ABS(NEW.amount);
  END IF;

  -- Debit types (explicit)
  IF NEW.entry_type::TEXT IN ('penalty', 'onboarding_fee', 'withdrawal', 'subscription_fee', 'purchase', 'cod_order', 'manual_deduct', 'other') THEN
    delta_balance := -ABS(NEW.amount);
  END IF;

  -- Ensure rider_wallet row exists
  INSERT INTO rider_wallet (rider_id, total_balance, last_updated_at)
  VALUES (NEW.rider_id, 0, NOW())
  ON CONFLICT (rider_id) DO NOTHING;

  -- Service-specific earnings (only for 'earning')
  IF NEW.entry_type::TEXT = 'earning' AND NEW.service_type IS NOT NULL AND NEW.amount > 0 THEN
    IF NEW.service_type::TEXT = 'food' THEN
      UPDATE rider_wallet SET earnings_food = earnings_food + NEW.amount, total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSIF NEW.service_type::TEXT = 'parcel' THEN
      UPDATE rider_wallet SET earnings_parcel = earnings_parcel + NEW.amount, total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSIF NEW.service_type::TEXT = 'person_ride' THEN
      UPDATE rider_wallet SET earnings_person_ride = earnings_person_ride + NEW.amount, total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSE
      UPDATE rider_wallet SET total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Service-specific penalties (only for 'penalty')
  IF NEW.entry_type::TEXT = 'penalty' AND NEW.service_type IS NOT NULL AND NEW.amount > 0 THEN
    IF NEW.service_type::TEXT = 'food' THEN
      UPDATE rider_wallet SET penalties_food = penalties_food + NEW.amount, total_balance = total_balance - NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSIF NEW.service_type::TEXT = 'parcel' THEN
      UPDATE rider_wallet SET penalties_parcel = penalties_parcel + NEW.amount, total_balance = total_balance - NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSIF NEW.service_type::TEXT = 'person_ride' THEN
      UPDATE rider_wallet SET penalties_person_ride = penalties_person_ride + NEW.amount, total_balance = total_balance - NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSE
      UPDATE rider_wallet SET total_balance = total_balance - NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Withdrawal: update total_withdrawn and subtract from total_balance
  IF NEW.entry_type::TEXT = 'withdrawal' AND NEW.amount > 0 THEN
    UPDATE rider_wallet SET total_withdrawn = total_withdrawn + NEW.amount, total_balance = total_balance - NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    RETURN NEW;
  END IF;

  -- All other types: apply delta to total_balance only
  UPDATE rider_wallet SET total_balance = total_balance + delta_balance, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS wallet_ledger_update_wallet_trigger ON wallet_ledger;
CREATE TRIGGER wallet_ledger_update_wallet_trigger
  AFTER INSERT ON wallet_ledger
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_wallet_from_ledger();

COMMENT ON FUNCTION trigger_update_wallet_from_ledger IS 'Updates rider_wallet on every wallet_ledger insert. Credits add to total_balance; debits subtract. earning/penalty update service-specific fields; withdrawal updates total_withdrawn. Balance can be negative.';
