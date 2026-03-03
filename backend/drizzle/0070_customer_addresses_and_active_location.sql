-- ============================================================================
-- CUSTOMER ADDRESSES & ACTIVE LOCATION (Swiggy/Zomato-style)
-- Multi-location per user, session-level active location, order lock.
-- Run after customers table exists (e.g. 0068).
-- ============================================================================

-- ============================================================================
-- 1) customer_addresses – unlimited saved addresses per customer
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL,

  label TEXT,                          -- 'Home' / 'Work' / 'Other'
  full_address TEXT NOT NULL,
  landmark TEXT,

  city TEXT,
  state TEXT,
  pincode TEXT,
  country TEXT DEFAULT 'IN',

  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,

  is_default BOOLEAN DEFAULT false,
  is_last_used BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT customer_addresses_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.customer_addresses IS 'Saved delivery addresses per customer. Label: Home/Work/Other. 7-decimal lat/lon for accuracy.';

-- Ensure columns exist if table was created by an older migration (ADD COLUMN IF NOT EXISTS)
ALTER TABLE public.customer_addresses ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;
ALTER TABLE public.customer_addresses ADD COLUMN IF NOT EXISTS is_last_used BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id
  ON public.customer_addresses(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_address_location
  ON public.customer_addresses(latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_last_used
  ON public.customer_addresses(customer_id, is_last_used) WHERE is_last_used = true;

-- ============================================================================
-- 2) customer_active_location – session-level active delivery location
-- Locked when order is placed until delivery completes.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customer_active_location (
  customer_id BIGINT PRIMARY KEY,

  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  address TEXT,

  locked_for_order BOOLEAN DEFAULT false,
  order_id BIGINT NULL,

  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT customer_active_location_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.customer_active_location IS 'Current delivery location for store suggestions. Locked when order placed; unlock after delivery.';

-- ============================================================================
-- 3) Trigger: updated_at for customer_addresses
-- ============================================================================
CREATE OR REPLACE FUNCTION update_customer_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customer_addresses_updated_at ON public.customer_addresses;
CREATE TRIGGER customer_addresses_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION update_customer_addresses_updated_at();

DROP TRIGGER IF EXISTS customer_active_location_updated_at ON public.customer_active_location;
CREATE TRIGGER customer_active_location_updated_at
  BEFORE UPDATE ON public.customer_active_location
  FOR EACH ROW EXECUTE FUNCTION update_customer_addresses_updated_at();
