-- Rider onboarding: hard cap Verify Instantly at 2 clicks / doc kind / 24h.
-- Separate from verification_requests so cancelled/failed provider rows cannot
-- under-count (I/O: 1 INSERT + 1 COUNT per verify click).

CREATE TABLE IF NOT EXISTS public.rider_electronic_verify_attempts (
  id bigserial PRIMARY KEY,
  rider_id bigint NOT NULL REFERENCES public.riders (id) ON DELETE CASCADE,
  doc_kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rider_electronic_verify_attempts_rider_doc_created_idx
  ON public.rider_electronic_verify_attempts (rider_id, doc_kind, created_at DESC);

COMMENT ON TABLE public.rider_electronic_verify_attempts IS
  'Counts rider-app Verify Instantly clicks (PAN/DL/RC/Aadhaar/Bank). Max 2 per doc_kind per 24h.';
