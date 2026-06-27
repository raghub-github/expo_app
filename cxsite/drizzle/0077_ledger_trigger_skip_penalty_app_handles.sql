-- =============================================================================
-- Dashboard app is the single source of truth for penalty and penalty_reversal.
-- Skip updating rider_wallet in the trigger for these two entry types so the
-- app's explicit update (per-service only) is not doubled.
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_update_wallet_from_ledger()
RETURNS TRIGGER AS $$
DECLARE
  delta_balance NUMERIC;
  is_credit BOOLEAN;
  svc TEXT;
BEGIN
  INSERT INTO rider_wallet (rider_id, total_balance, last_updated_at)
  VALUES (NEW.rider_id, 0, NOW())
  ON CONFLICT (rider_id) DO NOTHING;

  -- Dashboard app updates rider_wallet for penalty and penalty_reversal (per-service);
  -- skip here to avoid double-apply
  IF NEW.entry_type::TEXT IN ('penalty', 'penalty_reversal') THEN
    RETURN NEW;
  END IF;

  is_credit := NEW.entry_type::TEXT IN (
    'earning', 'refund', 'bonus', 'referral_bonus', 'incentive', 'surge',
    'failed_withdrawal_revert', 'cancellation_payout', 'manual_add'
  );
  IF NEW.entry_type::TEXT = 'adjustment' THEN
    is_credit := NEW.amount >= 0;
  END IF;

  IF is_credit THEN
    delta_balance := ABS(NEW.amount);
  ELSE
    delta_balance := -ABS(NEW.amount);
  END IF;

  IF NEW.entry_type::TEXT IN ('onboarding_fee', 'withdrawal', 'subscription_fee', 'purchase', 'cod_order', 'manual_deduct', 'other') THEN
    delta_balance := -ABS(NEW.amount);
  END IF;

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

  -- Refund (non-penalty_reversal): decrease penalty for that service when service_type set
  IF NEW.entry_type::TEXT = 'refund' AND svc IS NOT NULL AND NEW.amount > 0 THEN
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

COMMENT ON FUNCTION trigger_update_wallet_from_ledger IS 'Updates rider_wallet on wallet_ledger insert. penalty and penalty_reversal are handled by the dashboard app only (skipped here). Other types unchanged.';
