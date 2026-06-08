-- Rider feedback about customer experience at delivery (one row per order + rider).
-- Migration: 0297_rider_customer_delivery_feedback

CREATE TABLE IF NOT EXISTS public.rider_customer_delivery_feedback (
  id BIGSERIAL PRIMARY KEY,
  order_core_id BIGINT NOT NULL REFERENCES public.orders_core(id) ON DELETE CASCADE,
  rider_id BIGINT NOT NULL,
  order_id_text TEXT NOT NULL,
  rating SMALLINT NULL,
  feedback_tags JSONB NULL,
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

COMMENT ON TABLE public.rider_customer_delivery_feedback IS
  'Rider emoji rating / tags / comment about customer at food delivery completion.';
COMMENT ON COLUMN public.rider_customer_delivery_feedback.skipped IS
  'True when rider tapped Skip on customer feedback sheet.';
COMMENT ON COLUMN public.rider_customer_delivery_feedback.submitted_at IS
  'When rider submitted rating (NULL when skipped).';

CREATE INDEX IF NOT EXISTS rider_customer_delivery_feedback_order_idx
  ON public.rider_customer_delivery_feedback (order_core_id, submitted_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS rider_customer_delivery_feedback_rider_idx
  ON public.rider_customer_delivery_feedback (rider_id, created_at DESC);
