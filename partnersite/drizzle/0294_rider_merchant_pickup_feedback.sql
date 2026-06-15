-- Rider feedback about merchant/store experience at pickup (per active assignment row)
ALTER TABLE public.order_rider_assignments
  ADD COLUMN IF NOT EXISTS rider_merchant_rating SMALLINT,
  ADD COLUMN IF NOT EXISTS rider_merchant_feedback_tags JSONB,
  ADD COLUMN IF NOT EXISTS rider_merchant_feedback_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rider_merchant_feedback_skipped BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.order_rider_assignments.rider_merchant_rating IS
  'Rider 1–5 emoji rating for merchant experience at pickup.';
COMMENT ON COLUMN public.order_rider_assignments.rider_merchant_feedback_tags IS
  'Optional rider-selected feedback tag codes (JSON string array).';
COMMENT ON COLUMN public.order_rider_assignments.rider_merchant_feedback_at IS
  'When rider submitted merchant pickup feedback (rating + tags).';
COMMENT ON COLUMN public.order_rider_assignments.rider_merchant_feedback_skipped IS
  'True when rider tapped Skip on merchant pickup feedback sheet.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_rider_assignments_rider_merchant_rating_check'
  ) THEN
    ALTER TABLE public.order_rider_assignments
      ADD CONSTRAINT order_rider_assignments_rider_merchant_rating_check
      CHECK (rider_merchant_rating IS NULL OR (rider_merchant_rating >= 1 AND rider_merchant_rating <= 5));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS order_rider_assignments_rider_merchant_feedback_idx
  ON public.order_rider_assignments (order_core_id, rider_merchant_feedback_at DESC NULLS LAST)
  WHERE rider_merchant_feedback_at IS NOT NULL OR rider_merchant_feedback_skipped = TRUE;
