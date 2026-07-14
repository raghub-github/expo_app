-- 0126: Clear offers created from Merchant Portal (partnersite) or Merchant App
-- Partnersite mirror of backend/drizzle/0402_clear_merchant_portal_app_offers.sql
-- Apply after 0125.
--
-- Deletes all merchant_offers where created_source_platform is:
--   MERCHANT_PORTAL  → partnersite Create Offer
--   MERCHANT_APP     → merchant mobile app Create Offer
--
-- Does NOT delete offers created from ADMIN_DASHBOARD, AGENT_DASHBOARD, or SYSTEM.
-- WARNING: Destructive data cleanup.

BEGIN;

CREATE TEMP TABLE tmp_clear_partner_merchant_offers ON COMMIT DROP AS
SELECT id, offer_id, store_id, created_source_platform
FROM public.merchant_offers
WHERE created_source_platform IN ('MERCHANT_PORTAL', 'MERCHANT_APP');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'merchant_offer_applicability'
  ) THEN
    DELETE FROM public.merchant_offer_applicability a
    WHERE a.offer_id IN (SELECT id FROM tmp_clear_partner_merchant_offers);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'merchant_offer_conditions'
  ) THEN
    DELETE FROM public.merchant_offer_conditions c
    WHERE c.offer_id IN (SELECT id FROM tmp_clear_partner_merchant_offers);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'merchant_offer_usage'
  ) THEN
    DELETE FROM public.merchant_offer_usage u
    WHERE u.offer_id IN (SELECT id FROM tmp_clear_partner_merchant_offers);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'merchant_offer_usages'
  ) THEN
    DELETE FROM public.merchant_offer_usages u
    WHERE u.offer_id IN (SELECT id FROM tmp_clear_partner_merchant_offers);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ride_customer_payment_snapshots'
      AND column_name = 'merchant_offer_id'
  ) THEN
    EXECUTE $q$
      UPDATE public.ride_customer_payment_snapshots s
      SET merchant_offer_id = NULL
      WHERE s.merchant_offer_id IN (SELECT id FROM tmp_clear_partner_merchant_offers)
    $q$;
  END IF;
END $$;

DELETE FROM public.merchant_offers mo
WHERE mo.id IN (SELECT id FROM tmp_clear_partner_merchant_offers);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchant_stores'
      AND column_name = 'offer_pricing_cache_version'
  ) THEN
    UPDATE public.merchant_stores ms
    SET offer_pricing_cache_version = COALESCE(ms.offer_pricing_cache_version, 0) + 1
    WHERE ms.id IN (
      SELECT DISTINCT store_id FROM tmp_clear_partner_merchant_offers
    );
  END IF;
END $$;

COMMIT;
