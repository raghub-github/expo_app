-- Audience dimension for platform offers; normalize hybrid funding to platform-only (admin UI no longer creates HYBRID).

ALTER TABLE billing_platform_offers
  ADD COLUMN IF NOT EXISTS offer_audience text NOT NULL DEFAULT 'CUSTOMER';

ALTER TABLE billing_platform_offers
  DROP CONSTRAINT IF EXISTS billing_platform_offers_offer_audience_chk;

ALTER TABLE billing_platform_offers
  ADD CONSTRAINT billing_platform_offers_offer_audience_chk
  CHECK (offer_audience IN ('CUSTOMER', 'MERCHANT', 'RIDER'));

UPDATE billing_platform_offers
SET funding_mode = 'PLATFORM_ONLY',
    platform_share_pct = 100,
    merchant_share_pct = 0
WHERE funding_mode = 'HYBRID';

ALTER TABLE billing_platform_offers
  DROP CONSTRAINT IF EXISTS billing_platform_offers_funding_mode_chk;

ALTER TABLE billing_platform_offers
  ADD CONSTRAINT billing_platform_offers_funding_mode_chk
  CHECK (funding_mode IN ('PLATFORM_ONLY'));
