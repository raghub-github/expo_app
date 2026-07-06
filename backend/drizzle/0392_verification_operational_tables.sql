-- ============================================================================
--  0392_verification_operational_tables
--
--  Operational + archival layers of the verification database:
--    - verification_requests             one row per submit / retry
--    - verification_events               immutable state-machine transitions
--    - verification_provider_payloads    raw request / response / webhook bytes
--    - verification_webhooks             incoming webhooks, idempotent per event_id
--    - verification_files                artifacts we've mirrored to R2
--    - verification_documents            bridges verification_requests ↔
--                                        rider_documents / merchant_store_documents
--
--  Design notes (see Phase 2 §G):
--    - Retries mint new rows in verification_requests (parent_request_id +
--      attempt_number). No dedicated verification_attempts table.
--    - verification_events is append-only; every state change writes here.
--    - Raw provider bytes live in verification_provider_payloads so hot-path
--      scans on requests/events stay small.
--    - Webhook idempotency is DB-enforced via partial-unique on provider_event_id.
--    - verification_documents is the single seam to the existing manual doc
--      tables — exactly one of rider_document_id / merchant_document_id is
--      non-null.
-- ============================================================================

-- ── verification_requests ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verification_requests (
  id                          BIGSERIAL PRIMARY KEY,

  -- Our correlation id, sent to the provider verbatim.
  verification_id             TEXT NOT NULL,

  -- Retry chain. First attempt has parent_request_id = NULL and
  -- attempt_number = 1. Subsequent retries reference the root and increment.
  parent_request_id           BIGINT REFERENCES verification_requests(id) ON DELETE SET NULL,
  attempt_number              INTEGER NOT NULL DEFAULT 1,

  -- Provider details
  provider                    verification_provider_kind NOT NULL,
  provider_config_id          BIGINT REFERENCES verification_provider_configs(id) ON DELETE SET NULL,
  document_kind               verification_document_kind NOT NULL,

  -- Subject reference — kept loose (no FK) so the row survives if a
  -- rider / store is renumbered. Integrity is enforced at write time.
  subject_type                verification_subject_kind NOT NULL,
  subject_id                  BIGINT NOT NULL,

  -- Bridge back to existing projection tables (both nullable — bridge row in
  -- verification_documents carries the FK where it makes sense).
  rider_document_id           BIGINT,
  merchant_document_id        BIGINT,

  -- Policy provenance — which policy version approved this call.
  policy_snapshot_id          BIGINT REFERENCES verification_policy_versions(id) ON DELETE SET NULL,

  -- Outcome
  status                      verification_status_kind NOT NULL DEFAULT 'draft',
  status_reason               TEXT,
  business_identifier         TEXT,                                        -- PAN / DL / GSTIN / IFSC / …
  confidence                  NUMERIC(4,3),
  http_status                 INTEGER,
  duration_ms                 INTEGER,

  -- Provider identifiers
  provider_reference          TEXT,                                        -- Cashfree's reference_id
  -- Some Cashfree products silently accept duplicate verification_id (PAN),
  -- others 409 (DL). Set at product-enablement time so the service knows how
  -- to react without checking docs per call.
  provider_dedupe_behaviour   TEXT NOT NULL DEFAULT 'enforces_409',

  -- Provenance
  created_by                  INTEGER,                                     -- system_user id if kicked from dashboard
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- verification_id is unique across attempts because retries mint new ids.
  CONSTRAINT verification_requests_verification_id_uq UNIQUE (verification_id)
);

-- Every "which attempts for subject X" scan hits this composite.
CREATE INDEX IF NOT EXISTS verification_requests_subject_idx
  ON verification_requests (subject_type, subject_id, document_kind, created_at DESC);

-- Admin queue reads.
CREATE INDEX IF NOT EXISTS verification_requests_status_idx
  ON verification_requests (status, created_at DESC);

-- Fraud detection: "has any other subject used this identifier?"
-- Only verified rows count as duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS verification_requests_business_id_verified_uq
  ON verification_requests (document_kind, business_identifier)
  WHERE status = 'verified' AND business_identifier IS NOT NULL;

CREATE INDEX IF NOT EXISTS verification_requests_provider_ref_idx
  ON verification_requests (provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS verification_requests_retry_chain_idx
  ON verification_requests (parent_request_id, attempt_number)
  WHERE parent_request_id IS NOT NULL;

-- ── verification_provider_payloads ─────────────────────────────────────────
--
-- Raw provider bytes. Kept in its own table so a hot-path scan on
-- verification_events doesn't drag 50 KB of DL response through the buffer
-- cache. Consider partitioning by month once volume warrants.
CREATE TABLE IF NOT EXISTS verification_provider_payloads (
  id                     BIGSERIAL PRIMARY KEY,
  request_id             BIGINT NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
  direction              TEXT NOT NULL,                    -- 'request' | 'response' | 'webhook'
  http_status            INTEGER,
  headers                JSONB NOT NULL DEFAULT '{}'::jsonb,-- selected headers only (rate limit, request id, timestamp)
  body                   JSONB NOT NULL DEFAULT '{}'::jsonb,-- full body — the archive
  body_sha256            TEXT,                             -- for webhook dedupe
  r2_key                 TEXT,                             -- set if body offloaded to R2 (large payloads)
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT verification_provider_payloads_dir_ck CHECK (direction IN ('request','response','webhook'))
);

CREATE INDEX IF NOT EXISTS verification_provider_payloads_request_idx
  ON verification_provider_payloads (request_id, created_at);

CREATE INDEX IF NOT EXISTS verification_provider_payloads_sha_idx
  ON verification_provider_payloads (body_sha256)
  WHERE body_sha256 IS NOT NULL;

-- ── verification_webhooks ──────────────────────────────────────────────────
--
-- One row per accepted webhook. Idempotency lives here via partial-unique on
-- (provider, provider_event_id). Second delivery of the same event is a
-- silent no-op through INSERT ... ON CONFLICT DO NOTHING.
CREATE TABLE IF NOT EXISTS verification_webhooks (
  id                     BIGSERIAL PRIMARY KEY,
  provider               verification_provider_kind NOT NULL,
  provider_event_id      TEXT,                             -- from provider envelope
  event_type             TEXT NOT NULL,                    -- 'BANK_ACCOUNT_VERIFICATION_SUCCESS', etc.
  verification_id        TEXT NOT NULL,                    -- correlation to verification_requests
  signature_scheme       TEXT NOT NULL,                    -- 'header' | 'body_embedded'
  signature_valid        BOOLEAN NOT NULL,                 -- rows with FALSE kept for security ops
  received_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_time             TIMESTAMPTZ,
  payload_ref            BIGINT REFERENCES verification_provider_payloads(id) ON DELETE SET NULL,
  applied_at             TIMESTAMPTZ,                      -- NULL = queued, not yet applied to request
  applied_event_id       BIGINT,                           -- FK added after verification_events created
  CONSTRAINT verification_webhooks_sig_scheme_ck CHECK (signature_scheme IN ('header','body_embedded'))
);

-- Idempotency guarantee — DB-enforced.
CREATE UNIQUE INDEX IF NOT EXISTS verification_webhooks_dedupe_uq
  ON verification_webhooks (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS verification_webhooks_correlation_idx
  ON verification_webhooks (verification_id, received_at);

CREATE INDEX IF NOT EXISTS verification_webhooks_unapplied_idx
  ON verification_webhooks (received_at)
  WHERE applied_at IS NULL;

-- ── verification_events ────────────────────────────────────────────────────
--
-- Immutable append log of every state transition on a request.
-- Reconstructing a request's lifecycle = SELECT * WHERE request_id ORDER BY created_at.
CREATE TABLE IF NOT EXISTS verification_events (
  id                     BIGSERIAL PRIMARY KEY,
  request_id             BIGINT NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
  event_kind             verification_event_kind NOT NULL,
  from_status            verification_status_kind,          -- previous status; NULL for the initial submit
  to_status              verification_status_kind NOT NULL,
  actor_type             verification_actor_kind NOT NULL,
  actor_id               INTEGER,                           -- system_user id for admin actions
  payload_ref            BIGINT REFERENCES verification_provider_payloads(id) ON DELETE SET NULL,
  webhook_ref            BIGINT REFERENCES verification_webhooks(id) ON DELETE SET NULL,
  details                JSONB NOT NULL DEFAULT '{}'::jsonb,-- small breadcrumb (reason codes, thresholds, etc.)
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS verification_events_request_idx
  ON verification_events (request_id, created_at);

CREATE INDEX IF NOT EXISTS verification_events_status_idx
  ON verification_events (to_status, created_at DESC);

CREATE INDEX IF NOT EXISTS verification_events_actor_idx
  ON verification_events (actor_type, actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

-- Now that verification_events exists, wire the FK back from webhooks.
ALTER TABLE verification_webhooks
  ADD CONSTRAINT verification_webhooks_applied_event_fk
    FOREIGN KEY (applied_event_id) REFERENCES verification_events(id) ON DELETE SET NULL;

-- ── verification_files ─────────────────────────────────────────────────────
--
-- One row per artifact we've mirrored to R2 (photo, XML, PDF, QR).
-- Cashfree ships pre-signed S3 URLs with 24h TTL — see verified_data.photo in
-- DL/Voter responses. The mirror job downloads within 10 min and stores here.
CREATE TABLE IF NOT EXISTS verification_files (
  id                        BIGSERIAL PRIMARY KEY,
  request_id                BIGINT NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
  kind                      TEXT NOT NULL,                    -- 'photo' | 'signature' | 'xml' | 'pdf' | 'qr'
  source                    TEXT NOT NULL,                    -- 'provider_response' | 'webhook' | 'digilocker_fetch'
  provider_url              TEXT,                             -- kept for provenance even after expiry
  provider_url_expires_at   TIMESTAMPTZ,                      -- parsed from X-Amz-Expires
  r2_key                    TEXT,                             -- verification/<provider>/<verification_id>/artifact_…
  r2_mirrored_at            TIMESTAMPTZ,                      -- NULL = mirror pending or failed
  bytes                     BIGINT,
  content_type              TEXT,
  sha256                    TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS verification_files_request_idx
  ON verification_files (request_id);

CREATE INDEX IF NOT EXISTS verification_files_pending_mirror_idx
  ON verification_files (provider_url_expires_at)
  WHERE r2_mirrored_at IS NULL AND provider_url_expires_at IS NOT NULL;

-- ── verification_documents ─────────────────────────────────────────────────
--
-- Single seam between the auto layer and existing manual document tables.
-- Exactly one of rider_document_id / merchant_document_id must be set.
-- One row per verification_requests row that has actually applied a decision
-- to a projection.
CREATE TABLE IF NOT EXISTS verification_documents (
  id                          BIGSERIAL PRIMARY KEY,
  request_id                  BIGINT NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
  rider_document_id           BIGINT,                          -- FK-ish to rider_documents.id
  merchant_document_id        BIGINT,                          -- FK-ish to merchant_store_documents.id
  applied_to_projection_at    TIMESTAMPTZ,                     -- when we mutated the projection row
  projection_snapshot         JSONB NOT NULL DEFAULT '{}'::jsonb,-- pre-mutation copy for rollback
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT verification_documents_one_side_ck CHECK (
    (rider_document_id IS NOT NULL) <> (merchant_document_id IS NOT NULL)
  ),
  CONSTRAINT verification_documents_request_uq UNIQUE (request_id)
);

CREATE INDEX IF NOT EXISTS verification_documents_rider_idx
  ON verification_documents (rider_document_id)
  WHERE rider_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS verification_documents_merchant_idx
  ON verification_documents (merchant_document_id)
  WHERE merchant_document_id IS NOT NULL;
