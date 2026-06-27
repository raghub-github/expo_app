-- =============================================================================
-- Wallet credit requests: agents request wallet credits; approvers approve/reject.
-- On approval: write to wallet_ledger, update rider_wallet (FIFO/block sync).
-- =============================================================================

CREATE TABLE IF NOT EXISTS wallet_credit_requests (
  id BIGSERIAL PRIMARY KEY,
  rider_id INT NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  order_id BIGINT NULL REFERENCES orders(id) ON DELETE SET NULL,
  service_type TEXT NULL CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  idempotency_key TEXT NULL,
  requested_by_system_user_id INT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  requested_by_email TEXT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by_system_user_id INT NULL REFERENCES system_users(id) ON DELETE SET NULL,
  reviewed_by_email TEXT NULL,
  reviewed_at TIMESTAMPTZ NULL,
  review_note TEXT NULL,
  approved_ledger_ref TEXT NULL UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE wallet_credit_requests IS 'Agent-initiated wallet credit requests; require approver to approve or reject.';

CREATE INDEX IF NOT EXISTS wallet_credit_requests_rider_status_requested_idx
  ON wallet_credit_requests (rider_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS wallet_credit_requests_status_requested_idx
  ON wallet_credit_requests (status, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS wallet_credit_requests_idempotency_idx
  ON wallet_credit_requests (requested_by_system_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_credit_requests_pending_dedupe_idx
  ON wallet_credit_requests (rider_id, COALESCE(order_id, 0), amount, md5(reason))
  WHERE status = 'pending';
