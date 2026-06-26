-- ============================================================================
-- Add store_logo to merchant_parents for brand logo display
-- Migration: 0094_merchant_parents_store_logo
-- ============================================================================

ALTER TABLE public.merchant_parents
  ADD COLUMN IF NOT EXISTS store_logo TEXT NULL;

COMMENT ON COLUMN public.merchant_parents.store_logo IS 'URL to brand/store logo image for display on UI (e.g. Top Food Delivery Brands section)';
