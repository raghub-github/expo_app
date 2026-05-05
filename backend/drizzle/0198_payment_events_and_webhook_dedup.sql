-- =============================================================================
-- 0198_payment_events_and_webhook_dedup
--
-- Adds two append-only tables that make the food-order payment pipeline
-- debuggable, auditable, and safe against webhook retries.
--
-- 1. payment_events
--    Every observed state change on a pending_orders row writes one row here.
--    Sources: API finalize, Razorpay webhook, reconciler polling, refund
--    attempts. Never updated, only inserted — gives us a replayable timeline
--    per pending payment.
--
-- 2. payment_webhook_events
--    Keyed on Razorpay's event_id. Razorpay retries webhooks up to ~24 times
--    on non-2xx responses; even on 2xx duplicates can arrive. This table lets
--    us short-circuit duplicates at the edge while still letting the business
--    logic stay idempotent as a second safety net.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "payment_events" (
  "id"                  bigserial PRIMARY KEY,
  "pending_id"          text,
  "razorpay_order_id"   text,
  "razorpay_payment_id" text,
  "order_id"            text,
  "event_type"          text NOT NULL,     -- e.g. 'PAYMENT_STARTED', 'WEBHOOK_CAPTURED', 'WEBHOOK_FAILED', 'RECONCILE_REFUND', 'REFUND_PROCESSED'
  "source"              text NOT NULL,     -- 'api' | 'webhook' | 'reconciler' | 'refund'
  "prev_state"          text,              -- pending_orders.payment_state before
  "new_state"           text,              -- pending_orders.payment_state after
  "amount_paise"        bigint,
  "currency"            text,
  "failure_code"        text,
  "failure_message"     text,
  "payload"             jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at"          timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "payment_events_pending_id_idx" ON "payment_events" ("pending_id");
CREATE INDEX IF NOT EXISTS "payment_events_razorpay_order_id_idx" ON "payment_events" ("razorpay_order_id");
CREATE INDEX IF NOT EXISTS "payment_events_razorpay_payment_id_idx" ON "payment_events" ("razorpay_payment_id");
CREATE INDEX IF NOT EXISTS "payment_events_order_id_idx" ON "payment_events" ("order_id");
CREATE INDEX IF NOT EXISTS "payment_events_event_type_idx" ON "payment_events" ("event_type", "created_at");

CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
  "id"             bigserial PRIMARY KEY,
  -- Razorpay's `x-razorpay-event-id` header (or the event body's id). Unique
  -- across the provider, so we use it for dedup.
  "event_id"       text NOT NULL UNIQUE,
  "provider"       text NOT NULL DEFAULT 'razorpay',
  "event_type"     text NOT NULL,
  "signature"      text,
  "payload"        jsonb NOT NULL DEFAULT '{}'::jsonb,
  "processed_at"   timestamptz,
  "processing_error" text,
  "created_at"     timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "payment_webhook_events_event_type_idx" ON "payment_webhook_events" ("event_type", "created_at");
CREATE INDEX IF NOT EXISTS "payment_webhook_events_processed_at_idx" ON "payment_webhook_events" ("processed_at");
