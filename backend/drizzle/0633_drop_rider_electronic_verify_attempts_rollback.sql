-- Rollback 0633_drop_rider_electronic_verify_attempts
-- Recreates the rate-limit attempts table (empty). Prefer not to re-enable rate limits.

CREATE TABLE IF NOT EXISTS public.rider_electronic_verify_attempts (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  doc_kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rider_electronic_verify_attempts_rider_doc_created_idx
  ON public.rider_electronic_verify_attempts (rider_id, doc_kind, created_at DESC);
