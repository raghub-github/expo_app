-- GMitra Plus subscription / program flag for customer dashboard UI.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS gmitra_plus_active boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customers.gmitra_plus_active IS
  'GMitra Plus program: when true, show Active; otherwise Not Active in dashboard.';

CREATE INDEX IF NOT EXISTS customers_gmitra_plus_active_idx
  ON public.customers (gmitra_plus_active)
  WHERE deleted_at IS NULL;
