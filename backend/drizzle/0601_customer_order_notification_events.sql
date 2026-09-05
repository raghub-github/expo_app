-- One customer push per order + status event.
-- Atomic INSERT ... ON CONFLICT DO NOTHING is the send lock: concurrent
-- workers (eventBus + lifecycle + retries) cannot double-fire the same event.

CREATE TABLE IF NOT EXISTS public.customer_order_notification_events (
  id               BIGSERIAL PRIMARY KEY,
  order_id         TEXT NOT NULL,
  event_type       TEXT NOT NULL,
  event_key        TEXT NOT NULL,
  template_code    TEXT,
  formatted_order_id TEXT,
  claimed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ,
  notification_id  UUID,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_order_notification_events_order_event_uidx
  ON public.customer_order_notification_events (order_id, event_type);

CREATE UNIQUE INDEX IF NOT EXISTS customer_order_notification_events_event_key_uidx
  ON public.customer_order_notification_events (event_key);

CREATE INDEX IF NOT EXISTS customer_order_notification_events_claimed_idx
  ON public.customer_order_notification_events (claimed_at DESC);

COMMENT ON TABLE public.customer_order_notification_events IS
  'Idempotency lock for customer order-status pushes. UNIQUE(order_id, event_type): one notification event per transition.';
