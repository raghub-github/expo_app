-- Account deletion requests — the review queue for customer-initiated
-- account closure. A customer raises a request from the app (with a reason);
-- the account is deactivated and retained (no PII/document/number wipe), and
-- the ops team reviews each row before final closure.
--
-- We intentionally do NOT delete identity/transaction data here — Indian law
-- (PMLA, GST, IT Act) requires retention. See Account Deletion & Closure Policy.

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id            BIGSERIAL PRIMARY KEY,
  customer_id   TEXT        NOT NULL,
  phone_e164    TEXT,
  reason_code   TEXT        NOT NULL DEFAULT 'other',
  reason_text   TEXT,
  status        TEXT        NOT NULL DEFAULT 'pending_review',
  source        TEXT        NOT NULL DEFAULT 'app',
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at   TIMESTAMPTZ,
  reviewed_by   TEXT,
  review_notes  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_deletion_requests_customer_idx
  ON account_deletion_requests (customer_id);

CREATE INDEX IF NOT EXISTS account_deletion_requests_status_idx
  ON account_deletion_requests (status);
