-- ============================================================================
-- Ensure customer_addresses.last_used_at exists for MRU Saved Address ordering.
-- Column is declared in 0013_customer_domain_complete.sql; environments that only
-- applied 0070 may lack it. Safe to re-run (IF NOT EXISTS).
-- ============================================================================

ALTER TABLE public.customer_addresses
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

ALTER TABLE public.customer_addresses
  ADD COLUMN IF NOT EXISTS is_last_used BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_customer_addresses_last_used_at
  ON public.customer_addresses (customer_id, last_used_at DESC NULLS LAST)
  WHERE deleted_at IS NULL AND is_active = true;

COMMENT ON COLUMN public.customer_addresses.last_used_at IS
  'MRU timestamp: updated when user selects this Saved Address, places an order with it, or backend auto-restores it (kept_nearby).';
