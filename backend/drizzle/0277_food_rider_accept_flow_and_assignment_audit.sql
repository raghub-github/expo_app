-- Food rider accept flow (Super Admin) + append-only dispatch assignment audit timeline.
-- Migration: 0277_food_rider_accept_flow_and_assignment_audit

CREATE TABLE IF NOT EXISTS public.platform_service_rider_accept_flow (
  service_type text PRIMARY KEY,
  rider_accept_flow text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_service_rider_accept_flow_service_check
    CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  CONSTRAINT platform_service_rider_accept_flow_mode_check
    CHECK (rider_accept_flow IN ('before_merchant_accept', 'after_merchant_accept'))
);

COMMENT ON TABLE public.platform_service_rider_accept_flow IS
  'When riders may receive food/parcel dispatch offers relative to merchant acceptance.';

INSERT INTO public.platform_service_rider_accept_flow (service_type, rider_accept_flow)
VALUES
  ('food', 'before_merchant_accept'),
  ('parcel', 'after_merchant_accept'),
  ('person_ride', 'before_merchant_accept')
ON CONFLICT (service_type) DO NOTHING;

DROP TRIGGER IF EXISTS platform_service_rider_accept_flow_touch
  ON public.platform_service_rider_accept_flow;
CREATE TRIGGER platform_service_rider_accept_flow_touch
BEFORE UPDATE ON public.platform_service_rider_accept_flow
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.order_rider_dispatch_assignment_audit (
  id bigserial PRIMARY KEY,
  order_core_id bigint NOT NULL REFERENCES public.orders_core(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  rider_id bigint NOT NULL REFERENCES public.riders(id) ON DELETE RESTRICT,
  assignment_attempt_number integer NOT NULL DEFAULT 1,
  event_type text NOT NULL,
  dispatch_session_id bigint REFERENCES public.order_dispatch_sessions(id) ON DELETE SET NULL,
  wave_number integer,
  dispatch_radius_meters integer,
  offer_sent_at timestamptz,
  response_received_at timestamptz,
  assigned_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  unassigned_at timestamptz,
  timeout_at timestamptz,
  removed_by text,
  removal_reason text,
  actor_type text,
  actor_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_rider_dispatch_assignment_audit_event_check
    CHECK (event_type IN (
      'offer_sent',
      'offer_viewed',
      'accepted',
      'rejected',
      'assigned',
      'unassigned',
      'timeout',
      'cancelled',
      'removed'
    ))
);

COMMENT ON TABLE public.order_rider_dispatch_assignment_audit IS
  'Append-only rider dispatch assignment timeline — never update or delete rows.';

CREATE INDEX IF NOT EXISTS order_rider_dispatch_assignment_audit_order_created_idx
  ON public.order_rider_dispatch_assignment_audit (order_core_id, created_at ASC);

CREATE INDEX IF NOT EXISTS order_rider_dispatch_assignment_audit_order_id_created_idx
  ON public.order_rider_dispatch_assignment_audit (order_id, created_at ASC);

CREATE INDEX IF NOT EXISTS order_rider_dispatch_assignment_audit_rider_created_idx
  ON public.order_rider_dispatch_assignment_audit (rider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_rider_dispatch_assignment_audit_order_rider_idx
  ON public.order_rider_dispatch_assignment_audit (order_core_id, rider_id, created_at ASC);

CREATE INDEX IF NOT EXISTS order_rider_dispatch_assignment_audit_session_idx
  ON public.order_rider_dispatch_assignment_audit (dispatch_session_id)
  WHERE dispatch_session_id IS NOT NULL;
