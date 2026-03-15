-- Delivery charge per km (merchant self-delivery): store-level ₹/km (10–15), editable once per 30 days.
-- Used to compute customer delivery fee when order is fulfilled by merchant's own riders (distance × rate).
-- Table: merchant_stores only (no new table).

-- 1. Add columns to merchant_stores
ALTER TABLE public.merchant_stores
  ADD COLUMN IF NOT EXISTS delivery_charge_per_km NUMERIC(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS delivery_charge_per_km_last_updated_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.merchant_stores.delivery_charge_per_km IS 'Delivery charge in ₹ per km when store uses self-delivery (min 10, max 15). Set by merchant in portal; editable once per 30 days. Used to charge customer: distance_km × this rate.';
COMMENT ON COLUMN public.merchant_stores.delivery_charge_per_km_last_updated_at IS 'When delivery_charge_per_km was last updated; used to enforce once-per-30-days edit.';

-- 2. Enforce range 10–15 (inclusive); NULL allowed (not set)
ALTER TABLE public.merchant_stores
  DROP CONSTRAINT IF EXISTS merchant_stores_delivery_charge_per_km_range;
ALTER TABLE public.merchant_stores
  ADD CONSTRAINT merchant_stores_delivery_charge_per_km_range
  CHECK (delivery_charge_per_km IS NULL OR (delivery_charge_per_km >= 10 AND delivery_charge_per_km <= 15));
