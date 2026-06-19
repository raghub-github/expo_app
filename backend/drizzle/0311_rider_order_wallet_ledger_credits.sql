-- =============================================================================
-- Rider order delivery earnings → wallet_ledger idempotency
-- Backend credits rider wallet on food/person_ride delivery via ref keys:
--   rider_earn:delivery:{orders_core.id}
--   rider_earn:tip:{orders_core.id}
-- Trigger trigger_update_wallet_from_ledger() (0079) updates rider_wallet totals.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_rider_rider_earn_ref_uidx
  ON wallet_ledger (rider_id, ref)
  WHERE ref IS NOT NULL
    AND ref ~ '^rider_earn:(delivery|tip):[0-9]+$';

COMMENT ON INDEX wallet_ledger_rider_rider_earn_ref_uidx IS
  'One delivery-fee and one tip ledger row per rider order (orders_core.id).';
