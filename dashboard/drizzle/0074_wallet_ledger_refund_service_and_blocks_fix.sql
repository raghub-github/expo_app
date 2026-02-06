-- =============================================================================
-- 1. Ledger trigger: handle refund/penalty_reversal with service_type so that
--    penalty revert (and any refund) updates the correct penalty column and
--    total_balance in ONE update. This makes rider_negative_wallet_blocks
--    trigger fire and unblock the service when balance recovers.
-- 2. Ensures revert flow: insert wallet_ledger (refund) -> this trigger updates
--    rider_wallet (penalties_* -= amount, total_balance += amount) -> block
--    trigger runs and removes block when net >= 0.
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_update_wallet_from_ledger()
RETURNS TRIGGER AS $$
DECLARE
  delta_balance NUMERIC;
  is_credit BOOLEAN;
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

  -- Refund / penalty_reversal: decrease penalty for that service and add to total_balance (so block trigger fires and unblocks)
  IF NEW.entry_type::TEXT IN ('refund', 'penalty_reversal') AND NEW.service_type IS NOT NULL AND NEW.amount > 0 THEN
    IF NEW.service_type::TEXT = 'food' THEN
      UPDATE rider_wallet SET penalties_food = GREATEST(0, penalties_food - NEW.amount), total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSIF NEW.service_type::TEXT = 'parcel' THEN
      UPDATE rider_wallet SET penalties_parcel = GREATEST(0, penalties_parcel - NEW.amount), total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSIF NEW.service_type::TEXT = 'person_ride' THEN
      UPDATE rider_wallet SET penalties_person_ride = GREATEST(0, penalties_person_ride - NEW.amount), total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    ELSE
      UPDATE rider_wallet SET total_balance = total_balance + NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    END IF;
    RETURN NEW;
  END IF;

  -- manual_add with service_type: increase earnings for that service (so negative_wallet_blocks trigger can unblock when net >= 0)
  IF NEW.entry_type::TEXT = 'manual_add' AND NEW.service_type IS NOT NULL AND NEW.amount > 0 THEN
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

  -- Withdrawal
  IF NEW.entry_type::TEXT = 'withdrawal' AND NEW.amount > 0 THEN
    UPDATE rider_wallet SET total_withdrawn = total_withdrawn + NEW.amount, total_balance = total_balance - NEW.amount, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
    RETURN NEW;
  END IF;

  -- All other types: apply delta to total_balance only
  UPDATE rider_wallet SET total_balance = total_balance + delta_balance, last_updated_at = NOW() WHERE rider_id = NEW.rider_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trigger_update_wallet_from_ledger IS 'Updates rider_wallet on every wallet_ledger insert. earning/penalty/refund/penalty_reversal/manual_add update service-specific fields when service_type set; refund/penalty_reversal decrease penalty; manual_add increases earnings so negative_wallet_blocks trigger can unblock.';
