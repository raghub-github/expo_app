-- ============================================================================
-- OFFER AUDIT TRACKING
-- Migration: 0122_offer_audit_tracking
-- Tracks who created/updated each offer and enables full action history
-- via merchant_audit_logs (entity_type = 'OFFER').
-- ============================================================================

-- Ensure merchant_offers has created_by (may already exist from 0010)
ALTER TABLE public.merchant_offers
  ADD COLUMN IF NOT EXISTS created_by INTEGER NULL;

-- Who last updated and when
ALTER TABLE public.merchant_offers
  ADD COLUMN IF NOT EXISTS updated_by INTEGER NULL,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_by_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.merchant_offers.created_by IS 'User/system id that created the offer (optional).';
COMMENT ON COLUMN public.merchant_offers.updated_by IS 'User/system id that last updated the offer.';
COMMENT ON COLUMN public.merchant_offers.created_by_name IS 'Display name or email of creator (for audit display).';
COMMENT ON COLUMN public.merchant_offers.updated_by_name IS 'Display name or email of last updater.';
COMMENT ON COLUMN public.merchant_offers.updated_by_at IS 'When the offer was last updated (by a user).';

-- Index for filtering offers by creator (optional)
CREATE INDEX IF NOT EXISTS merchant_offers_created_by_idx
  ON public.merchant_offers(created_by)
  WHERE created_by IS NOT NULL;
