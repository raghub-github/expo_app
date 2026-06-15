-- Rider dispatch offer funnel: offered vs accepted vs rejected vs missed (timeout / no response).
-- Source detail: order_rider_dispatch_assignment_audit (append-only).

CREATE TABLE IF NOT EXISTS public.rider_dispatch_offer_stats (
  rider_id bigint PRIMARY KEY REFERENCES public.riders(id) ON DELETE CASCADE,
  offers_total bigint NOT NULL DEFAULT 0,
  offers_accepted bigint NOT NULL DEFAULT 0,
  offers_rejected bigint NOT NULL DEFAULT 0,
  offers_missed bigint NOT NULL DEFAULT 0,
  last_offer_at timestamptz,
  last_accepted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rider_dispatch_offer_stats_nonneg CHECK (
    offers_total >= 0
    AND offers_accepted >= 0
    AND offers_rejected >= 0
    AND offers_missed >= 0
  )
);

COMMENT ON TABLE public.rider_dispatch_offer_stats IS
  'Per-rider counters for dispatch offers (offer_sent / accept / reject / missed). Updated by dispatch audit pipeline.';

CREATE INDEX IF NOT EXISTS rider_dispatch_offer_stats_updated_idx
  ON public.rider_dispatch_offer_stats (updated_at DESC);

-- Backfill from existing audit rows (idempotent — run once on deploy).
INSERT INTO public.rider_dispatch_offer_stats (
  rider_id,
  offers_total,
  offers_accepted,
  offers_rejected,
  offers_missed,
  last_offer_at,
  last_accepted_at,
  updated_at
)
SELECT
  rider_id,
  COUNT(*) FILTER (WHERE event_type = 'offer_sent')::bigint,
  COUNT(*) FILTER (WHERE event_type = 'accepted')::bigint,
  COUNT(*) FILTER (WHERE event_type = 'rejected')::bigint,
  COUNT(*) FILTER (WHERE event_type = 'timeout')::bigint,
  MAX(created_at) FILTER (WHERE event_type = 'offer_sent'),
  MAX(accepted_at) FILTER (WHERE event_type = 'accepted'),
  NOW()
FROM public.order_rider_dispatch_assignment_audit
GROUP BY rider_id
ON CONFLICT (rider_id) DO UPDATE SET
  offers_total = EXCLUDED.offers_total,
  offers_accepted = EXCLUDED.offers_accepted,
  offers_rejected = EXCLUDED.offers_rejected,
  offers_missed = EXCLUDED.offers_missed,
  last_offer_at = EXCLUDED.last_offer_at,
  last_accepted_at = EXCLUDED.last_accepted_at,
  updated_at = NOW();
