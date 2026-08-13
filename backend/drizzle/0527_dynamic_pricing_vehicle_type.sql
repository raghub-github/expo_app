-- Adds VEHICLE-TYPE dimension to the dynamic pricing engine (Night/Rain/Peak/Festival/…),
-- so an admin can price e.g. Peak Hour differently for Bike vs Auto vs Car, matching the
-- vehicle-aware model already used for customer pricing (ride_customer_pricing,
-- parcel_customer_pricing) and rider leg pricing (rider_leg_pricing).
--
-- NULL vehicle_type = applies to ALL vehicles (today's behaviour — every existing row keeps
-- working unchanged: NULL is the implicit value for the new column on every current row).
-- A vehicle-specific row is an OVERRIDE for that vehicle within the same node/service/mode.

ALTER TABLE dynamic_pricing_rules
  ADD COLUMN IF NOT EXISTS vehicle_type ride_vehicle_pricing_type NULL;

COMMENT ON COLUMN dynamic_pricing_rules.vehicle_type IS
  'NULL = applies to all vehicles. A specific vehicle overrides the all-vehicles row for that mode/node/service.';

-- Replace the old "one row per (node, service, mode)" constraint with one that also allows
-- ONE additional row per specific vehicle — but still only ONE "all vehicles" (NULL) row.
-- COALESCE makes NULL behave as a real, single dedupe slot (a plain UNIQUE treats every NULL
-- as distinct, which would let admins silently create duplicate all-vehicle rows).
ALTER TABLE dynamic_pricing_rules DROP CONSTRAINT IF EXISTS dyn_pricing_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS dyn_pricing_uniq_idx
  ON dynamic_pricing_rules (
    geo_level, geo_ref_id, service_type, mode, COALESCE(vehicle_type::text, '_all')
  );

CREATE INDEX IF NOT EXISTS dyn_pricing_vehicle_idx
  ON dynamic_pricing_rules (vehicle_type) WHERE vehicle_type IS NOT NULL;

-- Effective rows for a location + service + vehicle: closest ancestor per (mode, service_type,
-- vehicle_type) combination — returns up to 4 candidate rows per mode from the closest node
-- (service specific/all × vehicle specific/all); the application layer (dynamic-pricing.ts)
-- already knows how to prefer the more specific service row, and now also prefers the more
-- specific vehicle row, using the SAME "prefer specific" pattern — nothing else changes.
CREATE OR REPLACE FUNCTION dynamic_pricing_rules_effective(
  p_level   geo_pricing_level,
  p_id      uuid,
  p_service text,
  p_vehicle ride_vehicle_pricing_type DEFAULT NULL
) RETURNS SETOF dynamic_pricing_rules
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (r.mode, r.service_type, r.vehicle_type) r.*
  FROM geo_pricing_chain_steps(p_level, p_id) c
  JOIN dynamic_pricing_rules r
    ON r.geo_level = c.step_level AND r.geo_ref_id = c.step_id
  WHERE r.is_active = true
    AND (r.service_type = p_service OR r.service_type = 'all')
    AND (r.vehicle_type IS NULL OR p_vehicle IS NULL OR r.vehicle_type = p_vehicle)
    AND (r.active_from IS NULL OR r.active_from <= now())
    AND (r.active_to   IS NULL OR r.active_to   >  now())
  ORDER BY r.mode, r.service_type, r.vehicle_type, c.step_ord ASC, r.priority DESC, r.id ASC;
$$;

COMMENT ON TABLE dynamic_pricing_rules IS
  'Geo + time + vehicle dynamic pricing (night/rain/peak/festival/…) for all services. Closest-ancestor-wins per mode; vehicle-specific overrides all-vehicles; funding split customer/company/shared; customer portion billed, company portion recorded.';
