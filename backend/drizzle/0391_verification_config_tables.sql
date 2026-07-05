-- ============================================================================
--  0391_verification_config_tables
--
--  Configuration layer of the verification database (see Phase 2 §G.3):
--    - verification_provider_configs    per-provider credentials + env + tier
--    - verification_policies            active policy per (subject, doc_kind)
--    - verification_policy_versions     immutable history of every policy edit
--    - verification_switches            global kill switches per (provider, doc_kind)
--
--  These land first because operational tables (0392) FK back to
--  provider_configs and policies. All rows here are safe to leave empty on
--  first ship — the service layer treats "no policy" as "manual", so nothing
--  changes behaviour until an admin flips a doc to auto.
-- ============================================================================

-- ── provider_configs ────────────────────────────────────────────────────────
--
-- One row per (provider, environment). Credentials are NOT stored here — the
-- credential_ref / webhook_secret_ref columns point to keys in the secret
-- manager (or env vars) that the runtime resolves. That keeps `SELECT *`
-- from ever leaking secrets to a log or a psql session.
CREATE TABLE IF NOT EXISTS verification_provider_configs (
  id                     BIGSERIAL PRIMARY KEY,
  provider               verification_provider_kind NOT NULL,
  environment            TEXT NOT NULL,                    -- 'sandbox' | 'production'
  base_url               TEXT NOT NULL,
  credential_ref         TEXT NOT NULL,                    -- e.g. 'env:CASHFREE_SANDBOX_CLIENT_ID' / 'vault:cf-prod-secret'
  webhook_secret_ref     TEXT,                             -- Cashfree reuses client_secret; kept nullable for future providers
  api_version            TEXT,                             -- date string e.g. '2023-12-12'
  timeout_ms             INTEGER NOT NULL DEFAULT 15000,
  rate_limit_tpm         INTEGER NOT NULL DEFAULT 100,     -- per-tier token bucket seed
  enabled_products       JSONB NOT NULL DEFAULT '{}'::jsonb,-- {"pan":true,"upi":false,…}
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT verification_provider_configs_env_uq UNIQUE (provider, environment)
);

CREATE INDEX IF NOT EXISTS verification_provider_configs_active_idx
  ON verification_provider_configs (provider, environment)
  WHERE is_active = TRUE;

-- ── policies ────────────────────────────────────────────────────────────────
--
-- Active policy per (subject_type, document_kind). Partial unique index on
-- WHERE effective_to IS NULL enforces "exactly one live policy" per slot;
-- superseded policies keep their row with effective_to set for audit.
CREATE TABLE IF NOT EXISTS verification_policies (
  id                     BIGSERIAL PRIMARY KEY,
  subject_type           verification_subject_kind NOT NULL,
  document_kind          verification_document_kind NOT NULL,
  mode                   verification_policy_mode NOT NULL DEFAULT 'manual',
  provider               verification_provider_kind,                        -- NULL when mode='manual'
  auto_approve           BOOLEAN NOT NULL DEFAULT TRUE,                     -- FALSE → verified auto results still queue for review
  confidence_threshold   NUMERIC(4,3),                                     -- below → manual_review
  retry_limit            INTEGER NOT NULL DEFAULT 2,
  retry_backoff_seconds  INTEGER NOT NULL DEFAULT 30,
  timeout_ms             INTEGER NOT NULL DEFAULT 15000,
  fallback_to_manual     BOOLEAN NOT NULL DEFAULT TRUE,
  -- subject_filter narrows the policy to a subset of subjects — used e.g. to
  -- skip RC/DL auto verify for rental / lease bikes where the vehicle
  -- belongs to a fleet operator, not the rider.
  --   {"vehicle_ownership": "own"}          → only own-vehicle riders
  --   {"has_own_vehicle": true}
  --   {"store_service_type": ["FOOD"]}      → only food stores
  subject_filter         JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_from         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to           TIMESTAMPTZ,
  created_by             INTEGER,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT verification_policies_provider_required
    CHECK (mode = 'manual' OR provider IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS verification_policies_active_uq
  ON verification_policies (subject_type, document_kind)
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS verification_policies_lookup_idx
  ON verification_policies (subject_type, document_kind, effective_from);

-- ── policy_versions ─────────────────────────────────────────────────────────
--
-- Every write to verification_policies also appends a frozen snapshot here.
-- verification_requests.policy_snapshot_id references this table so we can
-- reconstruct exactly which policy governed any call, months later.
CREATE TABLE IF NOT EXISTS verification_policy_versions (
  id                     BIGSERIAL PRIMARY KEY,
  policy_id              BIGINT NOT NULL REFERENCES verification_policies(id) ON DELETE RESTRICT,
  version_number         INTEGER NOT NULL,
  policy_snapshot        JSONB NOT NULL,
  changed_by             INTEGER,
  change_reason          TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT verification_policy_versions_uq UNIQUE (policy_id, version_number)
);

CREATE INDEX IF NOT EXISTS verification_policy_versions_policy_idx
  ON verification_policy_versions (policy_id, version_number DESC);

-- ── switches ───────────────────────────────────────────────────────────────
--
-- Global kill switches per (provider, document_kind). Distinct from policies:
-- policies are per-subject business rules ("EV bikes skip RC"), switches are
-- per-provider ops overrides ("Cashfree is down, force everything to manual").
-- Both are consulted before the provider layer submits.
CREATE TABLE IF NOT EXISTS verification_switches (
  id                     BIGSERIAL PRIMARY KEY,
  provider               verification_provider_kind NOT NULL,
  document_kind          verification_document_kind,       -- NULL = all doc kinds for this provider
  state                  verification_switch_state NOT NULL DEFAULT 'enabled',
  reason                 TEXT,
  tripped_by             TEXT,                             -- 'health_monitor' | 'admin' | 'auto_circuit_breaker'
  tripped_at             TIMESTAMPTZ,
  restored_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active row per slot (provider, document_kind). We treat NULL
-- document_kind as its own slot so a "everything off for cashfree" switch can
-- coexist with per-doc overrides.
CREATE UNIQUE INDEX IF NOT EXISTS verification_switches_slot_uq
  ON verification_switches (provider, COALESCE(document_kind::text, '__all__'))
  WHERE restored_at IS NULL;
