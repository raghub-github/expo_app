-- Migration 0219: Rename offers → rider_incentives, offer_participation → rider_incentive_participation
-- The "offers" table was always for rider incentive programs, not customer-facing discounts.
-- Renaming prevents confusion with the merchant_offers / billing_platform_offers discount system.

ALTER TABLE IF EXISTS offers RENAME TO rider_incentives;
ALTER TABLE IF EXISTS offer_participation RENAME TO rider_incentive_participation;

-- Rename indexes on rider_incentives (was offers)
ALTER INDEX IF EXISTS offers_scope_idx  RENAME TO rider_incentives_scope_idx;
ALTER INDEX IF EXISTS offers_active_idx RENAME TO rider_incentives_active_idx;
ALTER INDEX IF EXISTS offers_dates_idx  RENAME TO rider_incentives_dates_idx;

-- Rename indexes on rider_incentive_participation (was offer_participation)
ALTER INDEX IF EXISTS offer_participation_rider_id_idx
  RENAME TO rider_incentive_participation_rider_id_idx;
ALTER INDEX IF EXISTS offer_participation_offer_id_idx
  RENAME TO rider_incentive_participation_offer_id_idx;
ALTER INDEX IF EXISTS offer_participation_completed_idx
  RENAME TO rider_incentive_participation_completed_idx;
ALTER INDEX IF EXISTS offer_participation_rider_offer_idx
  RENAME TO rider_incentive_participation_rider_offer_idx;

COMMENT ON TABLE rider_incentives IS 'Rider incentive programmes (e.g. complete N deliveries in M days). Not related to customer-facing discount offers.';
COMMENT ON TABLE rider_incentive_participation IS 'Tracks rider progress and reward-claimed state for rider_incentives.';
