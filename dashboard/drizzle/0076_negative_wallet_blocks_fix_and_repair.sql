-- =============================================================================
-- Fix negative wallet blocks logic and repair existing data
-- 1. Re-apply ledger trigger: penalty/refund/penalty_reversal MUST update only
--    the service specified by service_type (never all three).
-- 2. Re-apply block trigger: replace blocks for rider from current wallet state.
-- 3. One-time repair: force block sync for riders that currently have blocks,
--    so blocks are recomputed from current wallet (fixes wrong "all three blocked"
--    and "blocks not removed after revert").
-- =============================================================================

-- Same as 0074: ledger trigger updates only the relevant service column
CREATE OR REPLACE FUNCTION trigger_update_wallet_from_ledger()
RETURNS TRIGGER AS $$
DECLARE
  delta_balance NUMERIC;
  is_credit BOOLEAN;
  svc TEXT;
BEGIN
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

  IF NEW.entry_type::TEXT IN ('penalty', 'onboarding_fee', 'withdrawal', 'subscription_fee', 'purchase', 'cod_order', 'manual_deduct', 'other') THEN
    delta_balance := -ABS(NEW.amount);
  END IF;

  INSERT INTO rider_wallet (rider_id, total_balance, last_updated_at)
  VALUES (NEW.rider_id, 0, NOW())
  ON CONFLICT (rider_id) DO NOTHING;

  svc := NULLIF(TRIM(NEW.service_type::TEXT), '');

  -- Service-specific earnings (only for 'earning')
  IF NEW.entry_type::TEXT = 'earning' AND svc IS NOT NULL AND NEW.amount > 0 THEN
    IF svc = 'food' THEN
      UPDATE rider_wallet SET earnings_food = earnings_food + NEW.amount, total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSIF svc = 'parcel' THEN
      UPDATE rider_wallet SET earnings_parcel = earnings_parcel + NEW.amount, total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSIF svc = 'person_ride' THEN
      UPDATE rider_wallet SET earnings_person_ride = earnings_person_ride + NEW.amount, total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSE
      UPDATE rider_wallet SET total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Service-specific penalties: ONLY the one service (never all three)
  IF NEW.entry_type::TEXT = 'penalty' AND svc IS NOT NULL AND NEW.amount > 0 THEN
    IF svc = 'food' THEN
      UPDATE rider_wallet SET penalties_food = penalties_food + NEW.amount, total_balance = total_balance - NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSIF svc = 'parcel' THEN
      UPDATE rider_wallet SET penalties_parcel = penalties_parcel + NEW.amount, total_balance = total_balance - NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSIF svc = 'person_ride' THEN
      UPDATE rider_wallet SET penalties_person_ride = penalties_person_ride + NEW.amount, total_balance = total_balance - NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSE
      UPDATE rider_wallet SET total_balance = total_balance - NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Refund / penalty_reversal: decrease penalty for THAT service only (so block trigger unblocks that service)
  IF NEW.entry_type::TEXT IN ('refund', 'penalty_reversal') AND svc IS NOT NULL AND NEW.amount > 0 THEN
    IF svc = 'food' THEN
      UPDATE rider_wallet SET penalties_food = GREATEST(0, penalties_food - NEW.amount), total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSIF svc = 'parcel' THEN
      UPDATE rider_wallet SET penalties_parcel = GREATEST(0, penalties_parcel - NEW.amount), total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSIF svc = 'person_ride' THEN
      UPDATE rider_wallet SET penalties_person_ride = GREATEST(0, penalties_person_ride - NEW.amount), total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSE
      UPDATE rider_wallet SET total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    END IF;
    RETURN NEW;
  END IF;

  -- manual_add with service_type
  IF NEW.entry_type::TEXT = 'manual_add' AND svc IS NOT NULL AND NEW.amount > 0 THEN
    IF svc = 'food' THEN
      UPDATE rider_wallet SET earnings_food = earnings_food + NEW.amount, total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSIF svc = 'parcel' THEN
      UPDATE rider_wallet SET earnings_parcel = earnings_parcel + NEW.amount, total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSIF svc = 'person_ride' THEN
      UPDATE rider_wallet SET earnings_person_ride = earnings_person_ride + NEW.amount, total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSE
      UPDATE rider_wallet SET total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.entry_type::TEXT = 'withdrawal' AND NEW.amount > 0 THEN
    UPDATE rider_wallet SET total_withdrawn = total_withdrawn + NEW.amount, total_balance = total_balance - NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    RETURN NEW;
  END IF;

  UPDATE rider_wallet SET total_balance = total_balance + delta_balance, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Block trigger: replace blocks from current wallet (only services with net < 0)
CREATE OR REPLACE FUNCTION sync_rider_negative_wallet_blocks_from_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  net_food   NUMERIC;
  net_parcel NUMERIC;
  net_person NUMERIC;
BEGIN
  net_food   := COALESCE(NEW.earnings_food, 0)   - COALESCE(NEW.penalties_food, 0);
  net_parcel := COALESCE(NEW.earnings_parcel, 0) - COALESCE(NEW.penalties_parcel, 0);
  net_person := COALESCE(NEW.earnings_person_ride, 0) - COALESCE(NEW.penalties_person_ride, 0);

  DELETE FROM rider_negative_wallet_blocks WHERE rider_id = NEW.rider_id;

  IF net_food < 0 THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'food', 'negative_wallet');
  END IF;
  IF net_parcel < 0 THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'parcel', 'negative_wallet');
  END IF;
  IF net_person < 0 THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'person_ride', 'negative_wallet');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rider_wallet_sync_negative_blocks ON rider_wallet;
CREATE TRIGGER rider_wallet_sync_negative_blocks
  AFTER INSERT OR UPDATE
  ON rider_wallet
  FOR EACH ROW
  EXECUTE FUNCTION sync_rider_negative_wallet_blocks_from_wallet();

-- Ensure ledger trigger is on parent wallet_ledger (required if partitioned)
DROP TRIGGER IF EXISTS wallet_ledger_update_wallet_trigger ON public.wallet_ledger;
CREATE TRIGGER wallet_ledger_update_wallet_trigger
  AFTER INSERT ON public.wallet_ledger
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_wallet_from_ledger();

-- One-time repair: recompute blocks for riders that currently have any negative_wallet blocks
-- (fixes wrong "all three blocked" and "blocks not removed after revert")
UPDATE rider_wallet
SET last_updated_at = NOW()
WHERE rider_id IN (SELECT DISTINCT rider_id FROM rider_negative_wallet_blocks);
