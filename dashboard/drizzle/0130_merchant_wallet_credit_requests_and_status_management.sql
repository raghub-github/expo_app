-- ============================================================================
-- MERCHANT WALLET CREDIT/DEBIT REQUESTS + STATUS MANAGEMENT + PERMISSION COLUMNS
-- ============================================================================

-- 1. Merchant wallet credit/debit requests (agent-initiated, admin-approved)
CREATE TABLE IF NOT EXISTS merchant_wallet_credit_requests (
  id BIGSERIAL PRIMARY KEY,
  wallet_id BIGINT NOT NULL,
  merchant_store_id BIGINT NOT NULL,

  direction TEXT NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'MANUAL_CREDIT',

  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),

  idempotency_key TEXT,

  requested_by_system_user_id BIGINT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  requested_by_email TEXT,
  requested_by_name TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  reviewed_by_system_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
  reviewed_by_email TEXT,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,

  approved_ledger_id BIGINT,

  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT mwcr_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES merchant_wallet(id) ON DELETE CASCADE,
  CONSTRAINT mwcr_store_id_fkey FOREIGN KEY (merchant_store_id) REFERENCES merchant_stores(id) ON DELETE CASCADE
);

COMMENT ON TABLE merchant_wallet_credit_requests IS 'Agent-initiated wallet credit/debit requests for merchants. Must be approved by SUPER_ADMIN or ADMIN. Tracks full lifecycle.';

CREATE INDEX IF NOT EXISTS mwcr_wallet_status_idx ON merchant_wallet_credit_requests(wallet_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS mwcr_status_requested_idx ON merchant_wallet_credit_requests(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS mwcr_store_idx ON merchant_wallet_credit_requests(merchant_store_id);

CREATE UNIQUE INDEX IF NOT EXISTS mwcr_idempotency_idx
  ON merchant_wallet_credit_requests(requested_by_system_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mwcr_pending_dedupe_idx
  ON merchant_wallet_credit_requests(wallet_id, direction, amount, md5(reason))
  WHERE status = 'PENDING';

-- 2. Add wallet adjustment columns to merchant_management_access
ALTER TABLE merchant_management_access
  ADD COLUMN IF NOT EXISTS can_request_wallet_adjustment BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_update_parent_status BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_update_store_status BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN merchant_management_access.can_request_wallet_adjustment IS 'Agent can create wallet credit/debit requests (not approve).';
COMMENT ON COLUMN merchant_management_access.can_update_parent_status IS 'Agent can update parent merchant status (block/suspend).';
COMMENT ON COLUMN merchant_management_access.can_update_store_status IS 'Agent can update store approval_status (block/suspend/reject).';

-- 3. Parent status update history (separate from store status history)
CREATE TABLE IF NOT EXISTS merchant_parent_status_history (
  id BIGSERIAL PRIMARY KEY,
  parent_id BIGINT NOT NULL REFERENCES merchant_parents(id) ON DELETE CASCADE,

  from_approval_status TEXT,
  to_approval_status TEXT NOT NULL,

  change_reason TEXT NOT NULL,
  change_notes TEXT,

  changed_by_system_user_id BIGINT REFERENCES system_users(id) ON DELETE SET NULL,
  changed_by_email TEXT,
  changed_by_name TEXT,

  status_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merchant_parent_status_history IS 'Audit trail for parent merchant status changes. Includes who changed, why, and full before/after state.';

CREATE INDEX IF NOT EXISTS mpsh_parent_id_idx ON merchant_parent_status_history(parent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mpsh_changed_by_idx ON merchant_parent_status_history(changed_by_system_user_id) WHERE changed_by_system_user_id IS NOT NULL;
