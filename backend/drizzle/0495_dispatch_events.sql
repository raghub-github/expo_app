-- Dispatch Engine — Phase 7: unified dispatch event stream (audit / observability).
--
-- Append-only log of every dispatch lifecycle event (session start, wave dispatched,
-- wave expanded, retry scheduled, exhausted, completed, offers sent, accepted, etc.).
-- No FK so a recording failure can never block dispatch; recorded best-effort.

CREATE TABLE IF NOT EXISTS public.dispatch_events (
  id BIGSERIAL PRIMARY KEY,
  order_core_id INTEGER NOT NULL,
  session_id BIGINT,
  service_type TEXT,
  event_type TEXT NOT NULL,
  wave_number INTEGER,
  rider_id INTEGER,
  radius_meters INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dispatch_events_order_idx
  ON public.dispatch_events (order_core_id, created_at);
CREATE INDEX IF NOT EXISTS dispatch_events_type_idx
  ON public.dispatch_events (event_type, created_at);

COMMENT ON TABLE public.dispatch_events IS
  'Append-only dispatch lifecycle audit stream (per order/session/wave/rider). Best-effort; never blocks dispatch.';
