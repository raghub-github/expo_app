-- Riders who rejected, were unassigned, or cancelled an order must not receive it again in dispatch.
-- Migration: 0281_rider_dispatch_order_exclusions

CREATE TABLE IF NOT EXISTS public.order_rider_dispatch_exclusions (
  id bigserial PRIMARY KEY,
  order_core_id bigint NOT NULL REFERENCES public.orders_core(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  rider_id bigint NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  exclusion_source text NOT NULL,
  reason_code text,
  reason_text text,
  actor_type text,
  actor_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_rider_dispatch_exclusions_source_check
    CHECK (exclusion_source IN (
      'rider_reject',
      'rider_cancel_assigned',
      'admin_unassign',
      'admin_reject',
      'system_removed'
    )),
  CONSTRAINT order_rider_dispatch_exclusions_order_rider_unique
    UNIQUE (order_core_id, rider_id)
);

COMMENT ON TABLE public.order_rider_dispatch_exclusions IS
  'Permanent per-order rider exclusions from dispatch pool (reject, cancel, admin unassign).';

CREATE INDEX IF NOT EXISTS order_rider_dispatch_exclusions_rider_idx
  ON public.order_rider_dispatch_exclusions (rider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_rider_dispatch_exclusions_order_idx
  ON public.order_rider_dispatch_exclusions (order_core_id);

-- Backfill from existing dispatch audit (reject / unassign / cancel).
INSERT INTO public.order_rider_dispatch_exclusions (
  order_core_id,
  order_id,
  rider_id,
  exclusion_source,
  reason_code,
  reason_text,
  actor_type,
  actor_id,
  metadata,
  created_at
)
SELECT DISTINCT ON (a.order_core_id, a.rider_id)
  a.order_core_id,
  a.order_id,
  a.rider_id,
  CASE a.event_type
    WHEN 'rejected' THEN 'rider_reject'
    WHEN 'unassigned' THEN 'admin_unassign'
    WHEN 'cancelled' THEN 'rider_cancel_assigned'
    ELSE 'system_removed'
  END,
  COALESCE(a.metadata->>'reasonCode', a.metadata->>'reason_code'),
  COALESCE(a.removal_reason, a.metadata->>'reasonText', a.metadata->>'reason_text'),
  a.actor_type,
  a.actor_id,
  a.metadata,
  a.created_at
FROM public.order_rider_dispatch_assignment_audit a
WHERE a.event_type IN ('rejected', 'unassigned', 'cancelled')
ORDER BY a.order_core_id, a.rider_id, a.created_at DESC
ON CONFLICT (order_core_id, rider_id) DO NOTHING;

INSERT INTO public.order_rider_dispatch_exclusions (
  order_core_id,
  order_id,
  rider_id,
  exclusion_source,
  reason_code,
  reason_text,
  created_at
)
SELECT
  u.order_core_id,
  u.order_id,
  u.rider_id,
  'admin_unassign',
  u.reason_code,
  u.reason_text,
  u.created_at
FROM public.order_rider_ride_unassignments u
ON CONFLICT (order_core_id, rider_id) DO NOTHING;
