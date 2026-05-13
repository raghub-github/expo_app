-- Migration 0218: Expand billing_platform_offers.funding_mode to allow co-funded offers
-- Previous constraint only allowed PLATFORM_ONLY, blocking merchant-co-funded campaigns.

ALTER TABLE billing_platform_offers
  DROP CONSTRAINT IF EXISTS billing_platform_offers_funding_mode_chk;

ALTER TABLE billing_platform_offers
  ADD CONSTRAINT billing_platform_offers_funding_mode_chk CHECK (
    funding_mode IN ('PLATFORM_ONLY','MERCHANT_ONLY','CO_FUNDED','PLATFORM_SHARE')
  );

-- Also relax the share-sum constraint to allow MERCHANT_ONLY (100% merchant, 0% platform)
ALTER TABLE billing_platform_offers
  DROP CONSTRAINT IF EXISTS billing_platform_offers_share_pct_chk;

ALTER TABLE billing_platform_offers
  ADD CONSTRAINT billing_platform_offers_share_pct_chk CHECK (
    platform_share_pct  >= 0
    AND merchant_share_pct >= 0
    AND platform_share_pct  <= 100
    AND merchant_share_pct  <= 100
    AND ROUND(platform_share_pct + merchant_share_pct, 2) = 100
  );

COMMENT ON COLUMN billing_platform_offers.funding_mode IS 'PLATFORM_ONLY: 100% platform funded. MERCHANT_ONLY: 100% merchant funded. CO_FUNDED: split per share_pct. PLATFORM_SHARE: platform tops up merchant offer.';
