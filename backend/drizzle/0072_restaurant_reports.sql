-- ============================================================================
-- Restaurant reports – customer-reported issues (menu, pricing, fraud, etc.)
-- store_id = merchant_stores.id from Supabase (stored as BIGINT, no FK).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_reports (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  store_id BIGINT NOT NULL,
  report_type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_reports_customer_id ON public.restaurant_reports(customer_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_reports_store_id ON public.restaurant_reports(store_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_reports_created_at ON public.restaurant_reports(created_at DESC);

COMMENT ON TABLE public.restaurant_reports IS 'Customer reports about restaurant menu, pricing, or practices. store_id = merchant_stores.id (Supabase).';
