-- =============================================================================
-- Global emergency block (total_balance <= -200) and FIFO unblock support.
-- 1. Add unblock_alloc_* columns for generic-credit allocation (effective_net).
-- 2. Replace sync_rider_negative_wallet_blocks_from_wallet():
--    - If total_balance <= -200: block ALL services (reason 'global_emergency').
--    - Else: block only services where effective_net = (earnings - penalties + unblock_alloc) <= -50.
-- Unlock global when total_balance >= 0.
-- =============================================================================

-- 1. Add unblock allocation columns to rider_wallet
ALTER TABLE rider_wallet
  ADD COLUMN IF NOT EXISTS unblock_alloc_food NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unblock_alloc_parcel NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unblock_alloc_person_ride NUMERIC(10, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN rider_wallet.unblock_alloc_food IS 'Generic credit allocated to food for unblock (FIFO). Effective net = earnings_food - penalties_food + unblock_alloc_food.';
COMMENT ON COLUMN rider_wallet.unblock_alloc_parcel IS 'Generic credit allocated to parcel for unblock (FIFO).';
COMMENT ON COLUMN rider_wallet.unblock_alloc_person_ride IS 'Generic credit allocated to person_ride for unblock (FIFO).';

-- 2. Replace block sync function: global -200 + effective_net -50 + allocation
CREATE OR REPLACE FUNCTION sync_rider_negative_wallet_blocks_from_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  eff_food   NUMERIC;
  eff_parcel  NUMERIC;
  eff_person  NUMERIC;
  svc_thresh NUMERIC := -50;
  global_thresh NUMERIC := -200;
  alloc_food NUMERIC;
  alloc_parcel NUMERIC;
  alloc_person NUMERIC;
  block_reason TEXT;
BEGIN
  alloc_food   := COALESCE(NEW.unblock_alloc_food, 0);
  alloc_parcel := COALESCE(NEW.unblock_alloc_parcel, 0);
  alloc_person := COALESCE(NEW.unblock_alloc_person_ride, 0);

  eff_food   := COALESCE(NEW.earnings_food, 0)   - COALESCE(NEW.penalties_food, 0)   + alloc_food;
  eff_parcel := COALESCE(NEW.earnings_parcel, 0) - COALESCE(NEW.penalties_parcel, 0) + alloc_parcel;
  eff_person := COALESCE(NEW.earnings_person_ride, 0) - COALESCE(NEW.penalties_person_ride, 0) + alloc_person;

  DELETE FROM rider_negative_wallet_blocks WHERE rider_id = NEW.rider_id;

  -- Global emergency block: total_balance <= -200 -> block ALL services
  IF COALESCE(NEW.total_balance, 0) <= global_thresh THEN
    block_reason := 'global_emergency';
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'food', block_reason),
           (NEW.rider_id, 'parcel', block_reason),
           (NEW.rider_id, 'person_ride', block_reason);
    RETURN NEW;
  END IF;

  -- Per-service block: effective_net <= -50
  block_reason := 'negative_wallet';
  IF eff_food <= svc_thresh THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'food', block_reason);
  END IF;
  IF eff_parcel <= svc_thresh THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'parcel', block_reason);
  END IF;
  IF eff_person <= svc_thresh THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'person_ride', block_reason);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_rider_negative_wallet_blocks_from_wallet() IS
  'Sync rider_negative_wallet_blocks. Global: total_balance <= -200 blocks all (reason global_emergency). Else block service when effective_net = (earnings - penalties + unblock_alloc) <= -50.';

-- 3. Ledger trigger: skip generic manual_add (no service_type) so app does wallet + FIFO + sync
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

  -- Generic manual_add (no service_type): app updates wallet + FIFO allocation + sync
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

  IF NEW.entry_type::TEXT IN ('onboarding_fee', 'withdrawal', 'subscription_fee', 'purchase', 'cod_order', 'manual_deduct', 'other') THEN
    delta_balance := -ABS(NEW.amount);
  END IF;

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

COMMENT ON FUNCTION trigger_update_wallet_from_ledger IS 'Updates rider_wallet on wallet_ledger insert. penalty, penalty_reversal, and generic manual_add (no service_type) are handled by app only.';
