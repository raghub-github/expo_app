-- 0124_store_packaging_and_delivery_charges.sql
-- Add packaging and delivery per-km charge fields to merchant_stores
-- for merchant partner / mobile pricing controls.

ALTER TABLE merchant_stores
  ADD COLUMN IF NOT EXISTS packaging_charge_amount NUMERIC(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS packaging_charge_last_updated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS delivery_charge_per_km NUMERIC(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS delivery_charge_per_km_last_updated_at TIMESTAMPTZ NULL;

-- Range constraints (idempotent via pg_constraint check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_stores_packaging_charge_amount_range'
  ) THEN
    ALTER TABLE merchant_stores
      ADD CONSTRAINT merchant_stores_packaging_charge_amount_range CHECK (
        packaging_charge_amount IS NULL
        OR (packaging_charge_amount >= 5 AND packaging_charge_amount <= 15)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_stores_delivery_charge_per_km_range'
  ) THEN
    ALTER TABLE merchant_stores
      ADD CONSTRAINT merchant_stores_delivery_charge_per_km_range CHECK (
        delivery_charge_per_km IS NULL
        OR (delivery_charge_per_km >= 7 AND delivery_charge_per_km <= 15)
      );
  END IF;
END;
$$;

