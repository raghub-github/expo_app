-- Transactional outbox table.
--
-- Producers write an outbox row inside the same Postgres transaction as the
-- domain change (order placed, payment captured, status flipped). A separate
-- relay worker polls unpublished rows and pushes them onto BullMQ (today) or
-- Kafka (Stage 7), then marks the row published. This guarantees no event is
-- lost when the message broker is briefly unreachable, and no event leaks
-- when the transaction rolls back.
--
-- Why a single generic table vs one per topic:
--   - Cheaper to maintain. Topic is a column, not a schema split.
--   - Easier to backfill / re-publish: pick rows by topic + WHERE published_at IS NULL.
--
-- Columns:
--   topic         — domain event name ("order.created", "payment.success"…)
--   payload       — JSONB body, free-form per topic; consumers validate shape
--   created_at    — write time
--   published_at  — NULL until the relay enqueues the job (or sends to Kafka)
--   attempts      — relay retry counter for backoff
--   last_error    — last relay failure reason (DLQ debugging)

CREATE TABLE IF NOT EXISTS public.event_outbox (
  id              BIGSERIAL PRIMARY KEY,
  topic           TEXT NOT NULL,
  payload         JSONB NOT NULL,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  published_at    TIMESTAMP WITH TIME ZONE NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT NULL
);

-- Hot path index — the relay walks unpublished rows oldest-first.
CREATE INDEX IF NOT EXISTS idx_event_outbox_unpublished
  ON public.event_outbox (created_at ASC)
  WHERE published_at IS NULL;

-- Forensic index — diagnose "where did topic X go" without sequential scan.
CREATE INDEX IF NOT EXISTS idx_event_outbox_topic
  ON public.event_outbox (topic, created_at DESC);
