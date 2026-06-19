-- Mirror: backend/drizzle/0330_rider_feedback_messages_arrays.sql
-- Migration: 0330_rider_feedback_messages_arrays

ALTER TABLE public.order_rider_assignments
  ADD COLUMN IF NOT EXISTS rider_merchant_rating SMALLINT,
  ADD COLUMN IF NOT EXISTS rider_merchant_feedback_tags JSONB,
  ADD COLUMN IF NOT EXISTS rider_merchant_feedback_messages TEXT[] NULL,
  ADD COLUMN IF NOT EXISTS rider_merchant_feedback_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rider_merchant_feedback_skipped BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.order_rider_assignments.rider_merchant_feedback_tags IS
  'Rider-selected merchant pickup feedback tag codes (JSON string array).';
COMMENT ON COLUMN public.order_rider_assignments.rider_merchant_feedback_messages IS
  'Human-readable merchant pickup feedback selections (TEXT array).';

CREATE TABLE IF NOT EXISTS public.rider_customer_delivery_feedback (
  id BIGSERIAL PRIMARY KEY,
  order_core_id BIGINT NOT NULL REFERENCES public.orders_core(id) ON DELETE CASCADE,
  rider_id BIGINT NOT NULL,
  order_id_text TEXT NOT NULL,
  rating SMALLINT NULL,
  feedback_tags JSONB NULL,
  feedback_messages TEXT[] NULL,
  comment_text TEXT NULL,
  skipped BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rider_customer_delivery_feedback_rating_check
    CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  CONSTRAINT rider_customer_delivery_feedback_order_rider_unique
    UNIQUE (order_core_id, rider_id)
);

ALTER TABLE public.rider_customer_delivery_feedback
  ADD COLUMN IF NOT EXISTS feedback_messages TEXT[] NULL;

COMMENT ON COLUMN public.rider_customer_delivery_feedback.feedback_tags IS
  'Rider-selected customer feedback tag codes (JSON string array).';
COMMENT ON COLUMN public.rider_customer_delivery_feedback.feedback_messages IS
  'Human-readable customer feedback tag labels + optional written comment (TEXT array).';
COMMENT ON COLUMN public.rider_customer_delivery_feedback.comment_text IS
  'Optional free-text comment from rider customer feedback sheet.';

CREATE INDEX IF NOT EXISTS rider_customer_delivery_feedback_order_idx
  ON public.rider_customer_delivery_feedback (order_core_id, submitted_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS rider_customer_delivery_feedback_rider_idx
  ON public.rider_customer_delivery_feedback (rider_id, created_at DESC);

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
