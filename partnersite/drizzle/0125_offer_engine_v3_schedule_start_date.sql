-- Offer Engine V3 — schedule / start-date alignment (partnersite mirror of backend 0401)
-- Apply after 0123 + 0124.
-- Note: applicable_time_* may already exist as TIME (not TEXT). Do not TRIM() them.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchant_offers'
      AND column_name = 'applicable_time_start'
  ) THEN
    ALTER TABLE public.merchant_offers
      ADD COLUMN applicable_time_start TIME WITHOUT TIME ZONE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchant_offers'
      AND column_name = 'applicable_time_end'
  ) THEN
    ALTER TABLE public.merchant_offers
      ADD COLUMN applicable_time_end TIME WITHOUT TIME ZONE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchant_offers'
      AND column_name = 'applicable_on_days'
  ) THEN
    ALTER TABLE public.merchant_offers
      ADD COLUMN applicable_on_days TEXT[];
  END IF;
END $$;

UPDATE public.merchant_offers mo
SET
  applicable_time_start = (
    NULLIF(BTRIM(mo.offer_metadata->>'applicable_time_start'), '')
  )::time
WHERE mo.applicable_time_start IS NULL
  AND mo.offer_metadata IS NOT NULL
  AND NULLIF(BTRIM(mo.offer_metadata->>'applicable_time_start'), '') IS NOT NULL
  AND NULLIF(BTRIM(mo.offer_metadata->>'applicable_time_start'), '') ~ '^\d{1,2}:\d{2}';

UPDATE public.merchant_offers mo
SET
  applicable_time_end = (
    NULLIF(BTRIM(mo.offer_metadata->>'applicable_time_end'), '')
  )::time
WHERE mo.applicable_time_end IS NULL
  AND mo.offer_metadata IS NOT NULL
  AND NULLIF(BTRIM(mo.offer_metadata->>'applicable_time_end'), '') IS NOT NULL
  AND NULLIF(BTRIM(mo.offer_metadata->>'applicable_time_end'), '') ~ '^\d{1,2}:\d{2}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merchant_offers_valid_window_check'
  ) THEN
    ALTER TABLE public.merchant_offers
      ADD CONSTRAINT merchant_offers_valid_window_check
      CHECK (valid_till >= valid_from);
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'merchant_offers_valid_window_check not applied: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_merchant_offers_store_valid_window
  ON public.merchant_offers (store_id, valid_from, valid_till)
  WHERE is_active = TRUE;
