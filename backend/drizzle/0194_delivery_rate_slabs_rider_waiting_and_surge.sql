-- Add rider payout knobs to progressive slab system:
-- - waiting_charge_per_min: additional amount per waiting minute (added before surge multiplier)
-- - surge_multiplier: multiplies (distance + base + waiting) payout (>= 1)
--
-- These are intended for actor_type='rider' and are typically configured on the first slab (min_km=0).

ALTER TABLE delivery_rate_slabs
  ADD COLUMN IF NOT EXISTS waiting_charge_per_min numeric(14, 6),
  ADD COLUMN IF NOT EXISTS surge_multiplier numeric(14, 6);

ALTER TABLE delivery_rate_slabs
  DROP CONSTRAINT IF EXISTS delivery_rate_slabs_waiting_nonneg,
  ADD CONSTRAINT delivery_rate_slabs_waiting_nonneg CHECK (waiting_charge_per_min IS NULL OR waiting_charge_per_min >= 0);

ALTER TABLE delivery_rate_slabs
  DROP CONSTRAINT IF EXISTS delivery_rate_slabs_surge_valid,
  ADD CONSTRAINT delivery_rate_slabs_surge_valid CHECK (surge_multiplier IS NULL OR surge_multiplier >= 1);

