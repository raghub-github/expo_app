ALTER TABLE public.merchant_store_settings
  DROP CONSTRAINT IF EXISTS merchant_store_settings_thermal_printer_width_check;

ALTER TABLE public.merchant_store_settings
  DROP COLUMN IF EXISTS thermal_printer_width_mm;
