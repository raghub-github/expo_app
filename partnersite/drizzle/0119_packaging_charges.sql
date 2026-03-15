-- Packaging charges: store-level fixed amount (merchant sets once per month); per-item flag (agent sets from agent dashboard).
-- - merchant_stores: packaging_charge_amount (₹), min 5 max 15; packaging_charge_last_updated_at (enforce edit once per 30 days).
-- - merchant_menu_items: packaging_charge_applied (agent turns on/off per item; when true, store amount applies to that item).

-- 1. Store-level: fixed packaging charge amount and last update timestamp
ALTER TABLE public.merchant_stores
  ADD COLUMN IF NOT EXISTS packaging_charge_amount NUMERIC(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS packaging_charge_last_updated_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.merchant_stores.packaging_charge_amount IS 'Fixed packaging charge in ₹ for this store (min 5, max 15). Set by merchant in portal; editable once per 30 days.';
COMMENT ON COLUMN public.merchant_stores.packaging_charge_last_updated_at IS 'When packaging_charge_amount was last updated; used to enforce once-per-month edit.';

-- Enforce amount between 5 and 15 (inclusive); NULL allowed (no charge set)
ALTER TABLE public.merchant_stores
  DROP CONSTRAINT IF EXISTS merchant_stores_packaging_charge_amount_range;
ALTER TABLE public.merchant_stores
  ADD CONSTRAINT merchant_stores_packaging_charge_amount_range
  CHECK (packaging_charge_amount IS NULL OR (packaging_charge_amount >= 5 AND packaging_charge_amount <= 15));

-- 2. Menu item: agent toggles whether this item has packaging charge applied (uses store amount)
ALTER TABLE public.merchant_menu_items
  ADD COLUMN IF NOT EXISTS packaging_charge_applied BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.merchant_menu_items.packaging_charge_applied IS 'When true, store packaging_charge_amount is applied to this item. Set by agent from agent dashboard.';
