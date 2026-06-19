-- Ensure subscription_fee ledger debits update rider_wallet (trigger + one-time repair).

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

  IF NEW.entry_type::TEXT IN ('penalty', 'penalty_reversal') THEN
    RETURN NEW;
  END IF;

  svc := NULLIF(TRIM(COALESCE(NEW.service_type::TEXT, '')), '');
  IF NEW.entry_type::TEXT = 'manual_add' AND svc IS NULL THEN
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

  IF NEW.entry_type::TEXT IN (
    'onboarding_fee', 'withdrawal', 'subscription_fee', 'purchase', 'cod_order', 'manual_deduct', 'other'
  ) THEN
    delta_balance := -ABS(NEW.amount);
  END IF;

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

DROP TRIGGER IF EXISTS wallet_ledger_update_wallet_trigger ON wallet_ledger;
CREATE TRIGGER wallet_ledger_update_wallet_trigger
  AFTER INSERT ON wallet_ledger
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_wallet_from_ledger();

COMMENT ON FUNCTION trigger_update_wallet_from_ledger IS
  'Updates rider_wallet on wallet_ledger insert. subscription_fee and other debits subtract from total_balance.';

-- Repair wallets where subscription_fee was logged but trigger did not debit rider_wallet.
UPDATE rider_wallet rw
SET
  total_balance = latest.balance,
  last_updated_at = NOW()
FROM (
  SELECT DISTINCT ON (wl.rider_id)
    wl.rider_id,
    wl.balance::numeric AS balance
  FROM wallet_ledger wl
  WHERE wl.entry_type = 'subscription_fee'
    AND wl.balance IS NOT NULL
  ORDER BY wl.rider_id, wl.created_at DESC, wl.id DESC
) latest
WHERE rw.rider_id = latest.rider_id
  AND rw.total_balance::numeric > latest.balance + 0.009;
