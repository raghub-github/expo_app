-- Merchant thermal printer width for KOT rendering (58mm | 80mm).
-- Migration: 0442_merchant_thermal_printer_width

ALTER TABLE public.merchant_store_settings
  ADD COLUMN IF NOT EXISTS thermal_printer_width_mm SMALLINT NOT NULL DEFAULT 80;

ALTER TABLE public.merchant_store_settings
  DROP CONSTRAINT IF EXISTS merchant_store_settings_thermal_printer_width_check;

ALTER TABLE public.merchant_store_settings
  ADD CONSTRAINT merchant_store_settings_thermal_printer_width_check
  CHECK (thermal_printer_width_mm IN (58, 80));

COMMENT ON COLUMN public.merchant_store_settings.thermal_printer_width_mm IS
  'Thermal roll width for KOT printing: 58 or 80 mm. Default 80.';
