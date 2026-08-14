-- Adds VEHICLE-TYPE dimension to service_payout_rules (rider % + waiting-charge rule),
-- matching the vehicle-aware model already used for customer pricing and dynamic pricing.
--
-- service_payout_rules has NO uniqueness constraint on (geo_level, geo_ref_id, service_type)
-- — it is resolved by geo closest-ancestor then ORDER BY priority DESC, id ASC (multiple
-- rows may coexist; the admin controls precedence via priority). So unlike
-- dynamic_pricing_rules / rider_leg_pricing, no unique index is needed here — the resolver
-- just needs to prefer a vehicle-specific row over an all-vehicles row before falling back
-- to priority, mirroring the same "prefer specific" pattern used everywhere else.
--
-- NULL vehicle_type = applies to ALL vehicles (every existing row's implicit value —
-- zero behaviour change until an admin adds a vehicle-specific override).

ALTER TABLE service_payout_rules
  ADD COLUMN IF NOT EXISTS vehicle_type ride_vehicle_pricing_type NULL;

COMMENT ON COLUMN service_payout_rules.vehicle_type IS
  'NULL = applies to all vehicles. A specific vehicle overrides the all-vehicles row for this node/service at the same or lower priority.';

CREATE INDEX IF NOT EXISTS service_payout_rules_vehicle_idx
  ON service_payout_rules (vehicle_type) WHERE vehicle_type IS NOT NULL;

-- Food's waiting charge should default to COMPANY-funded, matching the pre-pickup
-- first-mile default (geo_pre_pickup_compensation / 0524) — the customer is not charged
-- extra for a rider waiting at the restaurant; the company absorbs it. Only rows still at
-- the untouched CUSTOMER_100 default are flipped, preserving any deliberate admin override.
UPDATE service_payout_rules
   SET waiting_funding_mode = 'COMPANY_100',
       waiting_customer_share_pct = 0,
       waiting_company_share_pct = 100
 WHERE service_type = 'food'
   AND waiting_funding_mode = 'CUSTOMER_100'
   AND waiting_customer_share_pct = 100
   AND waiting_company_share_pct = 0;
