-- ============================================================================
--  0393_verification_ops_and_views
--
--  Ops + audit layer of the verification database:
--    - verification_retry_queue      pending retries with exponential backoff
--    - verification_provider_health  rolling health signal for auto-fallback
--    - verification_manual_reviews   items queued for agent review
--    - verification_audit_logs       human actions worth remembering
--
--  Plus two computed views used by the dashboard:
--    - v_verification_current_status latest attempt per (subject, doc_kind)
--    - v_verification_statistics     daily rollups by provider + doc_kind
--
--  The retry queue uses the same SKIP LOCKED pattern as the notification poller
--  already in the codebase, so any pattern quirk we learn there transfers.
-- ============================================================================

-- ── verification_retry_queue ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verification_retry_queue (
  id                     BIGSERIAL PRIMARY KEY,
  request_id             BIGINT NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
  next_attempt_at        TIMESTAMPTZ NOT NULL,
  attempt_count          INTEGER NOT NULL DEFAULT 0,       -- how many times worker has picked this up
  last_error             TEXT,                             -- Cashfree error code from prior attempt
  status                 verification_retry_status NOT NULL DEFAULT 'pending',
  locked_by              TEXT,                             -- worker id (for SKIP LOCKED semantics)
  locked_at              TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Worker query: FOR UPDATE SKIP LOCKED WHERE status='pending' AND next_attempt_at <= now()
CREATE INDEX IF NOT EXISTS verification_retry_queue_ready_idx
  ON verification_retry_queue (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS verification_retry_queue_request_idx
  ON verification_retry_queue (request_id);

-- ── verification_provider_health ───────────────────────────────────────────
--
-- Rolling health for auto-fallback and dashboards. Bucketed by
-- (provider, doc_kind, 5-min window). The health monitor writes; the policy
-- engine reads to decide "is Cashfree healthy enough to keep sending PAN?".
CREATE TABLE IF NOT EXISTS verification_provider_health (
  id                     BIGSERIAL PRIMARY KEY,
  provider               verification_provider_kind NOT NULL,
  document_kind          verification_document_kind,       -- NULL = overall (across all doc kinds)
  window_start           TIMESTAMPTZ NOT NULL,
  window_end             TIMESTAMPTZ NOT NULL,
  total_requests         INTEGER NOT NULL DEFAULT 0,
  success_count          INTEGER NOT NULL DEFAULT 0,       -- status IN ('verified','rejected')
  failure_count          INTEGER NOT NULL DEFAULT 0,       -- timeout, provider_down, 5xx
  p50_ms                 INTEGER,
  p95_ms                 INTEGER,
  p99_ms                 INTEGER,
  avg_confidence         NUMERIC(4,3),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Same reason as verification_switches: COALESCE on enum cast is not IMMUTABLE.
CREATE UNIQUE INDEX IF NOT EXISTS verification_provider_health_window_per_doc_uq
  ON verification_provider_health (provider, document_kind, window_start)
  WHERE document_kind IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS verification_provider_health_window_overall_uq
  ON verification_provider_health (provider, window_start)
  WHERE document_kind IS NULL;

CREATE INDEX IF NOT EXISTS verification_provider_health_recent_idx
  ON verification_provider_health (provider, window_end DESC);

-- ── verification_manual_reviews ────────────────────────────────────────────
--
-- One row per request that lands in the agent queue. Requests can arrive here
-- for several reasons: confidence < threshold, fraud suspicion, or an
-- explicit "requires_review" policy flag.
CREATE TABLE IF NOT EXISTS verification_manual_reviews (
  id                     BIGSERIAL PRIMARY KEY,
  request_id             BIGINT NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
  reason                 TEXT NOT NULL,                    -- 'low_confidence' | 'fraud_suspected' | 'policy_requires_review' | 'auto_failed_hybrid'
  assigned_to            INTEGER,                          -- system_user id
  assigned_at            TIMESTAMPTZ,
  state                  verification_manual_review_state NOT NULL DEFAULT 'queued',
  notes                  TEXT,
  resolved_at            TIMESTAMPTZ,
  resolved_by            INTEGER,
  resolution_decision    verification_status_kind,         -- 'verified' | 'rejected' | 'overridden'
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS verification_manual_reviews_queue_idx
  ON verification_manual_reviews (state, created_at)
  WHERE state IN ('queued','in_review');

CREATE INDEX IF NOT EXISTS verification_manual_reviews_request_idx
  ON verification_manual_reviews (request_id);

CREATE INDEX IF NOT EXISTS verification_manual_reviews_assignee_idx
  ON verification_manual_reviews (assigned_to, state)
  WHERE assigned_to IS NOT NULL;

-- ── verification_audit_logs ────────────────────────────────────────────────
--
-- Human actions worth remembering for compliance / debug. Only rows here on
-- explicit admin action (policy change, kill switch, override, credential
-- rotation, manual review resolve) — the state-machine transitions from
-- automated flow live in verification_events, not here.
CREATE TABLE IF NOT EXISTS verification_audit_logs (
  id                     BIGSERIAL PRIMARY KEY,
  actor_id               INTEGER NOT NULL,                 -- system_user id
  action                 TEXT NOT NULL,                    -- 'policy_change' | 'switch_flipped' | 'override' | 'retry_forced' | 'credential_rotated' | 'manual_review_resolved'
  target_kind            TEXT NOT NULL,                    -- 'policy' | 'switch' | 'request' | 'provider_config' | 'manual_review'
  target_id              BIGINT NOT NULL,
  before_snapshot        JSONB,
  after_snapshot         JSONB,
  reason                 TEXT,
  ip_address             TEXT,
  user_agent             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS verification_audit_logs_actor_idx
  ON verification_audit_logs (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS verification_audit_logs_target_idx
  ON verification_audit_logs (target_kind, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS verification_audit_logs_action_idx
  ON verification_audit_logs (action, created_at DESC);

-- ============================================================================
--  Views
-- ============================================================================

-- Current status per (subject, doc_kind). Latest attempt wins.
-- Not materialized — if it gets slow, promote to a materialized view refreshed
-- nightly. Postgres 15+ can also use `CREATE OR REPLACE`.
CREATE OR REPLACE VIEW v_verification_current_status AS
  SELECT DISTINCT ON (subject_type, subject_id, document_kind)
    subject_type,
    subject_id,
    document_kind,
    id                AS latest_request_id,
    verification_id   AS latest_verification_id,
    status,
    attempt_number,
    business_identifier,
    confidence,
    provider,
    provider_reference,
    status_reason,
    created_at
  FROM verification_requests
  ORDER BY subject_type, subject_id, document_kind, created_at DESC, id DESC;

-- Daily rollup used by the dashboard "verification analytics" tile.
-- Grouping by day + provider + document_kind is cheap enough to compute on
-- read for launch volumes; revisit if it appears in slow query logs.
CREATE OR REPLACE VIEW v_verification_statistics AS
  SELECT
    date_trunc('day', created_at)::date               AS day,
    provider,
    document_kind,
    COUNT(*)                                          AS requests,
    SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS successes,
    SUM(CASE WHEN status IN ('failed','timeout','provider_down') THEN 1 ELSE 0 END) AS failures,
    SUM(CASE WHEN status = 'fallback_manual' THEN 1 ELSE 0 END) AS fallbacks,
    SUM(CASE WHEN status = 'manual_review' THEN 1 ELSE 0 END)    AS manual_reviews,
    ROUND(AVG(duration_ms)::numeric, 0)               AS avg_duration_ms,
    ROUND(AVG(confidence)::numeric, 3)                AS avg_confidence
  FROM verification_requests
  GROUP BY 1, 2, 3
  ORDER BY 1 DESC, 2, 3;
