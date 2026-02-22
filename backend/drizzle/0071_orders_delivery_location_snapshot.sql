-- ============================================================================
-- ORDERS_CORE: Delivery location snapshot at order time (7-decimal precision)
-- Snapshot when order is placed. NEVER depend on live user location after.
-- ============================================================================

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS delivery_latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS delivery_longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS delivery_address TEXT;

COMMENT ON COLUMN public.orders_core.delivery_latitude IS 'Delivery lat at order time (snapshot). 7-decimal precision. Do not update after place.';
COMMENT ON COLUMN public.orders_core.delivery_longitude IS 'Delivery lon at order time (snapshot). 7-decimal precision. Do not update after place.';
COMMENT ON COLUMN public.orders_core.delivery_address IS 'Full delivery address text at order time (snapshot).';

-- Optional checks for valid range
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders_core' AND column_name = 'delivery_latitude') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'orders_core' AND constraint_name = 'orders_core_delivery_latitude_valid') THEN
      ALTER TABLE public.orders_core ADD CONSTRAINT orders_core_delivery_latitude_valid
        CHECK (delivery_latitude IS NULL OR (delivery_latitude >= -90 AND delivery_latitude <= 90));
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders_core' AND column_name = 'delivery_longitude') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'orders_core' AND constraint_name = 'orders_core_delivery_longitude_valid') THEN
      ALTER TABLE public.orders_core ADD CONSTRAINT orders_core_delivery_longitude_valid
        CHECK (delivery_longitude IS NULL OR (delivery_longitude >= -180 AND delivery_longitude <= 180));
    END IF;
  END IF;
END $$;
